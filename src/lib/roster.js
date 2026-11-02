/* global window, self, module */
// Member / cast lookup: who is really in a group or franchise, from Wikipedia (member lists, character + voice-cast
// sections) and MusicBrainz (band-membership relations). Used to refine "Add music": the YouTube Music catalog links
// characters to their voice actors and to unrelated work, so a roster is the only reliable "is this part of it?" check.
//
// Two halves share this file:
//   - lookup() does the network requests; it only works from the background service worker (that is where the
//     host_permissions for these sites apply), reached through the YTMO_LOOKUP message.
//   - indexPage() / classify() are pure and run in the content script against a looked-up page.
(function () {
  const root = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis;
  const YTMO = (root.YTMO = root.YTMO || {});

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Romanization varies between sources ("Kujō" / "Kujo" / "Kujou"), so fold Latin diacritics and long-vowel spellings.
  const fold = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ou|oo/g, 'o')
      .replace(/uu/g, 'u');
  const key = (s) => fold(s).replace(/&/g, 'and').replace(/[^\p{L}\p{N}]+/gu, '');
  const tokens = (s) => fold(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

  // ---------- wikitext parsing ----------

  const stripNoise = (s) =>
    String(s || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<ref\b[^>]*\/>/gi, '')
      .replace(/<ref\b[\s\S]*?<\/ref>/gi, '');

  const clean = (s) =>
    String(s || '')
      .replace(/'{2,}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\{[^{}]*\}\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  /** Display text of every [[wikilink]] in `s` ("[[Joshua (American singer)|Joshua]]" -> "Joshua"). */
  function links(s) {
    const out = [];
    const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
    let m;
    while ((m = re.exec(s))) {
      if (/^(file|image|category|wikipedia|help|template):/i.test(m[1])) continue;
      out.push(clean(m[2] || m[1].replace(/\s*\([^)]*\)\s*$/, '')));
    }
    return out.filter(Boolean);
  }

  /** Split template arguments on top-level pipes only (not those inside [[links]] or nested {{templates}}). */
  function splitArgs(s) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const two = s.substr(i, 2);
      if (two === '[[' || two === '{{') {
        depth++;
        cur += two;
        i++;
      } else if (two === ']]' || two === '}}') {
        depth--;
        cur += two;
        i++;
      } else if (s[i] === '|' && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += s[i];
    }
    out.push(cur);
    return out;
  }

  /** Argument lists of every `{{name|...}}` template on a line. */
  function templates(line, name) {
    const out = [];
    const re = new RegExp(`\\{\\{\\s*${name}\\s*\\|`, 'gi');
    let m;
    while ((m = re.exec(line))) {
      let depth = 1;
      let i = re.lastIndex;
      for (; i < line.length && depth > 0; i++) {
        const two = line.substr(i, 2);
        if (two === '{{') {
          depth++;
          i++;
        } else if (two === '}}') {
          depth--;
          i++;
        }
      }
      out.push(splitArgs(line.slice(re.lastIndex, depth === 0 ? i - 2 : i)));
    }
    return out;
  }

  const ROSTER_HEADING = /\b(members?|cast|characters?|line-?ups?|units?|sub-?units?)\b/i;
  const GENERIC_HEADING = /^(members?|characters?|cast|main (cast|characters?)|supporting (cast|characters?)|voice cast|others?|sub-?units?|units?|current members?|former members?|active members?|inactive members?|line-?ups?|timeline|.* team)$/i;
  const LATIN_NAME = /^[\p{Script=Latin}\s.'’·-]+$/u;

  /**
   * The roster a Wikipedia article describes: entries `{ names, voice, unit }` (a character's romanized names and their
   * voice actors, or a member's stage names) for everything listed under a Members / Characters / Cast / Units heading,
   * plus the unit/sub-unit headings themselves.
   */
  function parseWikitext(wikitext) {
    const members = [];
    const units = [];
    const stack = []; // [{ level, title }]
    let last = null; // the character entry a following {{voiced by}} line belongs to
    for (const raw of stripNoise(wikitext).split('\n')) {
      const h = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(raw);
      if (h) {
        const level = h[1].length;
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        // Unit headings come as "{{Nihongo|RYUSEITAI|流星隊}}" or "RYUSEITAI (流星隊)": keep the Latin name, drop the native-script
        // part, so it matches the plain name YouTube Music credits.
        const heading = h[2].replace(/\{\{\s*nihongo\s*\|([^|{}]*)[^{}]*\}\}/gi, '$1');
        stack.push({ level, title: clean(heading).replace(/\s*[(（][^)）]*[)）]\s*$/, '') || clean(heading) });
        last = null;
        const inRoster = stack.some((s) => ROSTER_HEADING.test(s.title));
        const title = stack[stack.length - 1].title;
        if (inRoster && title && !GENERIC_HEADING.test(title) && !/^timeline$/i.test(title) && !units.includes(title)) units.push(title);
        continue;
      }
      if (!stack.length || !stack.some((s) => ROSTER_HEADING.test(s.title)) || /^timeline$/i.test(stack[stack.length - 1].title)) continue;
      const unit = [...stack].reverse().map((s) => s.title).find((t) => !GENERIC_HEADING.test(t)) || '';

      const nih = templates(raw, 'nihongo')[0];
      if (nih) {
        const names = [clean(nih[0])];
        const romaji = clean(nih[2] || '');
        if (romaji && !/=/.test(nih[2]) && LATIN_NAME.test(romaji)) names.push(romaji);
        last = { names: names.filter(Boolean), voice: [], unit };
        if (last.names.length) members.push(last);
        continue;
      }
      const voiced = templates(raw, 'voiced by')[0];
      if (voiced) {
        // First argument = the original (Japanese) cast, possibly several actors over time; later ones are dubs.
        const actors = links(voiced[0]);
        const plain = clean(voiced[0].replace(/\[\[[^\]]*\]\]/g, ''));
        if (!actors.length && plain && LATIN_NAME.test(plain)) actors.push(plain);
        if (last) last.voice.push(...actors);
        else if (actors.length) members.push({ names: [], voice: actors, unit });
        continue;
      }
      const b = /^[*;]\s*(.*)$/.exec(raw);
      if (b) {
        const name = links(b[1])[0] || (/'''([^']+)'''/.exec(b[1]) || [])[1];
        if (name && clean(name)) {
          last = { names: [clean(name)], voice: [], unit };
          members.push(last);
        }
      }
    }
    return { units, members };
  }

  // ---------- network (background service worker only) ----------

  async function getJson(url) {
    const ua = 'PlaylistOrganizerExtension/0.7 (https://github.com/iNeedTea/YoutubeMusicPlaylistManager)';
    const res = await fetch(url, { headers: { Accept: 'application/json', 'Api-User-Agent': ua, 'User-Agent': ua } });
    if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
    return res.json();
  }

  async function wikipediaPages(query) {
    const s = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&format=json&srsearch=${encodeURIComponent(query)}`);
    const pages = [];
    for (const hit of (s.query && s.query.search) || []) {
      let p;
      try {
        p = await getJson(`https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&redirects=1&format=json&formatversion=2&page=${encodeURIComponent(hit.title)}`);
      } catch (_) {
        continue; // one article failing to load shouldn't lose the others
      }
      const wt = p.parse && p.parse.wikitext;
      if (!wt) continue;
      const r = parseWikitext(wt);
      if (r.members.length < 2) continue; // not an article about a group/franchise with a cast
      pages.push({ source: 'Wikipedia', title: p.parse.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.parse.title.replace(/ /g, '_'))}`, ...r });
      if (pages.length >= 3) break;
    }
    return pages;
  }

  /** MusicBrainz band members — only when the name resolves to one clearly-best group (e.g. not "Seventeen" the Indonesian band vs. SEVENTEEN). */
  async function musicBrainzPage(query) {
    const s = await getJson(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${query.replace(/"/g, '')}"`)}&fmt=json&limit=3`);
    const [top, next] = s.artists || [];
    if (!top || top.score < 90 || (next && next.score > top.score - 10)) return null;
    await sleep(1100); // MusicBrainz asks for at most one request per second
    const a = await getJson(`https://musicbrainz.org/ws/2/artist/${top.id}?inc=artist-rels&fmt=json`);
    const members = (a.relations || [])
      .filter((r) => r.type === 'member of band' && r.direction === 'backward' && r.artist && !r.ended)
      .map((r) => ({ names: [r.artist.name], voice: [], unit: '' }));
    if (members.length < 2) return null;
    return { source: 'MusicBrainz', title: a.name, url: `https://musicbrainz.org/artist/${top.id}`, units: [], members };
  }

  /** → { pages: [{ source, title, url, units, members }], errors: [] } */
  async function lookup(query) {
    const q = String(query || '').trim();
    const out = { pages: [], errors: [] };
    if (!q) return out;
    try {
      out.pages.push(...(await wikipediaPages(q)));
    } catch (e) {
      out.errors.push(String(e.message || e));
    }
    try {
      const mb = await musicBrainzPage(q);
      if (mb) out.pages.push(mb);
    } catch (e) {
      out.errors.push(String(e.message || e));
    }
    return out;
  }

  // ---------- matching an artist-page name against a roster ----------

  /** { names, actors, units } flattened from a looked-up page, for classify(). */
  function indexPage(page) {
    const names = [];
    const actors = [];
    for (const m of (page && page.members) || []) {
      names.push(...m.names);
      actors.push(...m.voice);
    }
    return { names, actors, units: (page && page.units) || [] };
  }

  /** Same person/name, ignoring case, punctuation and word order ("Kujo Tenn" = "Tenn Kujo"; "Tenn" = "Tenn Kujo"). */
  function nameLike(a, b) {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    const ta = tokens(a);
    const tb = tokens(b);
    const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    return s.length > 0 && s.every((t) => l.includes(t)) && (s.length > 1 || s[0].length >= 3);
  }

  /** "Tenn Kujo(CV.Hikaru Midorikawa)" -> { character, actor }; null for anything not in that style. */
  function parseCredit(name) {
    const m = /^(.*?)\s*[(（]\s*CV\s*[.:：]?\s*([^)）]*)[)）]?\s*$/i.exec(String(name || ''));
    return m ? { character: m[1].trim(), actor: m[2].trim() } : null;
  }

  /**
   * What a credited act is, relative to the roster: 'cast' (a listed character), 'member' (a listed member), 'unit'
   * (a listed unit/sub-unit), 'actor' (a listed voice actor under their own name, or voicing some *other* character —
   * their work outside the franchise), or null (not on the roster).
   */
  function classify(name, idx) {
    const cv = parseCredit(name);
    if (cv) {
      // The character has to be on the roster. A listed actor alone isn't enough: they voice plenty of other
      // franchises' characters, and that is exactly the unrelated work this check is here to keep out.
      if (cv.character && idx.names.some((n) => nameLike(n, cv.character))) return 'cast';
      if (cv.actor && idx.actors.some((a) => nameLike(a, cv.actor))) return 'actor';
      return null;
    }
    if (idx.names.some((n) => nameLike(n, name))) return 'member';
    const k = key(name);
    if (idx.units.some((u) => key(u) === k || (key(u).length >= 4 && k.includes(key(u))))) return 'unit';
    if (idx.actors.some((a) => nameLike(a, name))) return 'actor';
    return null;
  }

  YTMO.roster = { lookup, parseWikitext, indexPage, classify, parseCredit, nameLike };
  if (typeof module !== 'undefined' && module.exports) module.exports = YTMO.roster;
})();
