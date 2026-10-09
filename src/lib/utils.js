/* global window */
// Shared helpers. Everything lives under window.YTMO so the plain (non-module)
// content scripts can share code without a bundler.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Poll `fn` until it returns a truthy value or the timeout elapses.
   * Resolves with the value, or null on timeout.
   */
  async function waitFor(fn, { timeout = 4000, interval = 100 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const v = fn();
        if (v) return v;
      } catch (_) {
        /* keep polling */
      }
      await sleep(interval);
    }
    return null;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- title / artist normalization for duplicate matching ----

  // Word lists are split in two: WORD lists get Unicode-aware word boundaries
  // (Latin, Cyrillic, Greek, Korean...); CJK lists match anywhere, since Chinese
  // and Japanese don't separate words with spaces ("现场版", "リミックス").

  // Upload labels that never distinguish songs: "(Official Video)", "[Lyrics]", "(HD)", "(Vídeo Oficial)", "(公式)"...
  const LABEL_WORDS =
    'official|audio|video|music video|lyrics?|lyric video|visuali[sz]er|hd|hq|4k|mv|explicit|clean' +
    '|oficial|officiel(?:le)?|offiziell(?:es)?|ufficiale|officieel|resmi|letra|paroles|testo|liedtext|songtekst' +
    '|официальн\\w*|клип|видео|텍스트|가사|뮤직비디오|공식';
  const LABEL_CJK = '公式|官方|歌詞|歌词|字幕|高清|完整版|純音樂|纯音乐|ミュージックビデオ';

  // Alternate-version markers: "(Remix)", "- Sped Up", "[Live]", "(Taylor's Version)", "(En Vivo)", "(Ao Vivo)"...
  const VERSION_WORDS =
    // English
    "remix(?:es|ed)?|remaster(?:ed)?|version|ver\\.?|edit|mix|mixed|live|acoustic|instrumental|karaoke|demo|sped ?up|slowed|reverb|nightcore|extended|radio|mono|stereo|deluxe|bonus(?: track)?|reprise|rework(?:ed)?|re-?record(?:ed|ing)?|taylor'?s version|from the vault|orchestral|unplugged|stripped|piano|vip|dub|club|original|alt(?:ernate)?|single|album|bootleg|cover|8d|lo-?fi|chopped|screwed" +
    // Spanish / Portuguese
    '|en vivo|en directo|directo|ao vivo|remezcla|remezclado|versi[oó]n|vers[aã]o|ac[uú]stic[oa]|remasterizad[oa]|edici[oó]n|edi[cç][aã]o|acelerad[oa]|lent[oa]|orquestal|extendid[oa]|estendid[oa]' +
    // French
    '|en direct|en public|version|acoustique|remasteris[ée]e?|remix[ée]e?|instrumentale?|orchestrale?|reprise' +
    // German
    '|live-?version|akustik(?:version)?|akustisch|neuaufnahme|neu aufgenommen|remastert|orchester(?:version)?|klavier(?:version)?|instrumentalversion' +
    // Italian
    '|dal vivo|versione|acustic[oa]|rimasterizzat[oa]|strumentale|orchestrale' +
    // Dutch / Turkish / Indonesian / Polish
    '|akoestisch|akustik|canl[ıi]|versiyon|h[ıi]zland[ıi]r[ıi]lm[ıi]ş|yavaşlat[ıi]lm[ıi]ş|versi|akustik|na żywo|wersja|akustyczn[aey]' +
    // Russian / Ukrainian
    '|ремикс|ремікс|версия|версія|живьём|живьем|концертн\\w*|акустик\\w*|акустическ\\w*|инструментал\\w*|ремастер\\w*|ускоренн\\w*|замедленн\\w*|кавер' +
    // Korean
    '|리믹스|라이브|어쿠스틱|버전|버젼|인스트루멘탈|인스트|리마스터|커버|피아노|오케스트라|느리게|빠르게' +
    // Japanese anime/game release conventions, romanized (also cover the countable-if-any
    // Latin-script uploads use): a "TV size" edit is trimmed to broadcast length, "off vocal"
    // is the instrumental/karaoke track, "on vocal" its counterpart, etc.
    '|tv ?size|tv ?(?:ver\\.?|version|edit)|full ?size|full ?(?:ver\\.?|version)|short ?size|short ?(?:ver\\.?|version)|off ?vocal|on ?vocal|game ?size|movie ?size|movie ?(?:ver\\.?|version)|ova ?size';
  const VERSION_CJK =
    // Chinese (simplified + traditional)
    '现场版|現場版|现场|現場|演唱会版|演唱會版|混音|重混|重制版|重製版|重制|重製|伴奏|翻唱|钢琴版|鋼琴版|吉他版|加速版|减速版|減速版|慢速版|加长版|加長版|完整版|清唱|无损|無損|纯音乐版|純音樂版|原版|新版|旧版|舊版|演奏版|弦乐版|弦樂版|电音版|電音版|说唱版|饒舌版' +
    // Japanese
    '|リミックス|ライブ|ライヴ|アコースティック|インストゥルメンタル|インスト|リマスター|バージョン|ヴァージョン|弾き語り|生演奏|カバー|ピアノ|オーケストラ|カラオケ|デモ|スロー|スピードアップ' +
    // Japanese anime/game release conventions, katakana forms
    '|TVサイズ|ＴＶサイズ|オフボーカル|オフヴォーカル|オンボーカル|オンヴォーカル|フルサイズ|ショートサイズ|ゲームサイズ|ムービーサイズ';

  // Unicode-aware "word boundary": not preceded/followed by a letter or digit.
  const NB = '(?<![\\p{L}\\p{N}])';
  const NA = '(?![\\p{L}\\p{N}])';
  const markerRe = (words, cjk) => new RegExp(`${NB}(?:${words})${NA}${cjk ? '|(?:' + cjk + ')' : ''}`, 'iu');
  const LABEL_RE = markerRe(LABEL_WORDS, LABEL_CJK);
  const VERSION_RE = markerRe(VERSION_WORDS, VERSION_CJK);
  // Version marker after a separator: "Song - Remix", "Song / Remix", "曲名 － Live"
  const DASH_VERSION_RE = new RegExp(`\\s[-–—|/／－]\\s(?=.*(?:${NB}(?:${VERSION_WORDS})${NA}|(?:${VERSION_CJK}))).*$`, 'iu');
  // Trailing markers, possibly joined by + & /: "Song Sped Up", "Song Slowed + Reverb", "曲名 现场版", "曲名リミックス"
  const TRAIL_VERSION_RE = new RegExp(`(?:(?:\\s+[+&/]?\\s*(?:${VERSION_WORDS})${NA})|(?:\\s*(?:${VERSION_CJK})))+\\s*$`, 'iu');
  // Brackets, including full-width and CJK corner brackets
  const BRACKET_RE = /[([（［【「『]([^)\]）］】」』]*)[)\]）］】」』]/gu;

  /** Remove every (...) / [...] / （...） / 【...】 group whose text matches `re`. */
  function stripBracketsMatching(s, re) {
    return s.replace(BRACKET_RE, (m) => (re.test(m) ? '' : m));
  }

  const FEAT_WORDS = 'feat|ft|featuring|with|con|avec|mit|com|参与|參與|참여|フィーチャリング|feat\\.?';
  const FEAT_BRACKET_RE = new RegExp(`[([（［【「『]\\s*(?:${FEAT_WORDS})\\.?\\s+[^)\\]）］】」』]*[)\\]）］】」』]`, 'giu');
  const FEAT_TAIL_RE = /\s+(?:feat|ft)\.?\s+.*$/iu;

  function stripFeat(s) {
    return String(s || '').replace(FEAT_BRACKET_RE, '').replace(FEAT_TAIL_RE, '');
  }

  /** Lower-case, "&" -> "and", drop everything that isn't a letter or digit. */
  function normalizeKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim();
  }

  /**
   * Matching key for a title. Feat. credits and upload labels are always ignored;
   * with `versions` on, remix/live/remaster/etc. markers are ignored too, so
   * "Song (Remix)" and "Song - Sped Up" collapse onto "Song".
   */
  function titleKey(title, { versions = false } = {}) {
    let s = stripFeat(title);
    s = stripBracketsMatching(s, LABEL_RE);
    if (versions) {
      s = stripBracketsMatching(s, VERSION_RE);
      s = s.replace(DASH_VERSION_RE, '');
      s = s.replace(TRAIL_VERSION_RE, '');
    }
    return normalizeKey(s);
  }

  function hasVersionMarker(title) {
    return VERSION_RE.test(stripFeat(title));
  }

  /** "A, B & C feat. D" -> ["A", "B", "C", "D"] (fallback when the row has no artist links). */
  function splitArtists(s) {
    return String(s || '')
      .split(/\s*(?:,|&|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bx\b|\band\b)\s*/i)
      .map((a) => a.trim())
      .filter(Boolean);
  }

  function artistKey(artists) {
    return (artists || []).map(normalizeKey).filter(Boolean).sort().join('+');
  }

  function parseDuration(text) {
    if (!text) return 0;
    const parts = String(text)
      .trim()
      .split(':')
      .map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function formatTotal(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (h) return `${h} hr ${m} min`;
    return `${m} min`;
  }

  function toCSV(rows, headers) {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map((h) => esc(h.label)).join(',')];
    for (const r of rows) lines.push(headers.map((h) => esc(r[h.key])).join(','));
    return lines.join('\r\n');
  }

  function download(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function safeFilename(s) {
    return String(s || 'playlist').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  /**
   * Both sites' menu/dialog-opening animations stall indefinitely in a backgrounded
   * or unfocused tab (Chrome throttles the rendering work involved), which otherwise
   * shows up as a generic "did not open" timeout after several seconds per track.
   * Call this before driving a menu so that case fails immediately with an actionable
   * message instead of waiting out the timeout, once per track, with no explanation.
   */
  function requireTabVisible() {
    if (typeof document !== 'undefined' && document.hidden) {
      throw new Error('This tab is not visible or focused — bring it to the foreground and try again');
    }
  }

  /**
   * music.youtube.com enforces Trusted Types (`require-trusted-types-for 'script'`).
   * Content scripts run in an isolated world and are normally exempt, but if the
   * enforcement ever applies, route markup through our own policy. All markup we
   * build is escaped with escapeHtml() where it includes page data.
   */
  let ttPolicy = null;
  try {
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      ttPolicy = window.trustedTypes.createPolicy('ytmo-html', { createHTML: (s) => s });
    }
  } catch (_) {
    ttPolicy = null;
  }

  function setHTML(el, html) {
    if (ttPolicy) {
      el.innerHTML = ttPolicy.createHTML(String(html));
      return;
    }
    el.innerHTML = html;
  }

  YTMO.utils = {
    setHTML,
    sleep,
    waitFor,
    debounce,
    escapeHtml,
    requireTabVisible,
    normalizeKey,
    titleKey,
    hasVersionMarker,
    splitArtists,
    artistKey,
    stripFeat,
    parseDuration,
    formatDuration,
    formatTotal,
    toCSV,
    download,
    safeFilename,
    isVisible,
  };
})();
