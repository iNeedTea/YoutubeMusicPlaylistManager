/* global window */
// "Add music by artist" — YTM only. Looks an artist up in YouTube Music's own catalog
// (search -> artist page -> every album/single/EP + the artist's song list), collapses
// alternate versions of the same song, and bulk-adds the result to a playlist. Same
// authenticated InnerTube pipeline as release dates (metadata.js) and physical reordering.
//
// No LLM involved: the catalog is the source of truth, so nothing here can invent a song.
// Response parsing is deliberately structural (walk for known renderer keys, identify
// things by their navigation endpoint's page type) rather than path-based, because the
// nesting differs between artist/album/playlist pages and shifts between YTM releases.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const U = YTMO.utils;

  const it = (endpoint, body) => YTMO.meta.innertube(endpoint, body);

  // Search filter "artists" (the same opaque value YTM's own filter chip sends). If YTM ever
  // changes it, searchArtists() falls back to an unfiltered search and picks artists out of it.
  const ARTIST_FILTER = 'EgWKAQIgAWoMEA4QChADEAQQCRAF';

  const PT_ARTIST = 'MUSIC_PAGE_TYPE_ARTIST';
  const PT_ALBUM = 'MUSIC_PAGE_TYPE_ALBUM';

  // ---------- generic response helpers ----------

  const text = (o) => (o && Array.isArray(o.runs) ? o.runs.map((r) => r.text || '').join('') : (o && o.simpleText) || '');

  /** Depth-first walk over arrays/objects. `fn(node)` returning false skips that node's children. */
  function walk(node, fn, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 90) return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v, fn, depth + 1);
      return;
    }
    if (fn(node) === false) return;
    for (const k of Object.keys(node)) walk(node[k], fn, depth + 1);
  }

  const browseOf = (ep) => (ep && ep.browseEndpoint) || null;
  const pageTypeOf = (ep) => {
    const b = browseOf(ep);
    return (b && b.browseEndpointContextSupportedConfigs && b.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig && b.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType) || '';
  };
  const isArtistEp = (ep) => {
    const b = browseOf(ep);
    if (!b || !b.browseId) return false;
    const pt = pageTypeOf(ep);
    return pt ? pt === PT_ARTIST : /^UC/.test(b.browseId);
  };
  const isAlbumEp = (ep) => {
    const b = browseOf(ep);
    if (!b || !b.browseId) return false;
    return pageTypeOf(ep) === PT_ALBUM || /^MPREb_/.test(b.browseId);
  };
  const lastThumb = (r) => {
    const t = r && r.thumbnail && ((r.thumbnail.musicThumbnailRenderer && r.thumbnail.musicThumbnailRenderer.thumbnail) || r.thumbnail.croppedSquareThumbnailRenderer);
    const list = (t && t.thumbnails) || (r && r.thumbnailRenderer && r.thumbnailRenderer.musicThumbnailRenderer && r.thumbnailRenderer.musicThumbnailRenderer.thumbnail && r.thumbnailRenderer.musicThumbnailRenderer.thumbnail.thumbnails) || [];
    return list.length ? list[list.length - 1].url : '';
  };

  /** Next-page token of a continuable response (old `nextContinuationData` and new `continuationCommand` shapes). */
  function findContinuation(res) {
    let tok = '';
    walk(res, (n) => {
      if (tok) return false;
      if (n.nextContinuationData && n.nextContinuationData.continuation) tok = n.nextContinuationData.continuation;
      else if (n.continuationCommand && n.continuationCommand.token) tok = n.continuationCommand.token;
    });
    return tok;
  }

  // ---------- artist search ----------

  function extractArtists(res) {
    const out = [];
    const seen = new Set();
    const add = (ep, name, subtitle, thumbnail) => {
      const id = browseOf(ep) && browseOf(ep).browseId;
      if (!id || seen.has(id) || !name) return;
      seen.add(id);
      out.push({ browseId: id, name, subtitle: subtitle || '', thumbnail: thumbnail || '' });
    };
    walk(res, (n) => {
      const card = n.musicCardShelfRenderer; // the "top result" card
      if (card) {
        const run = card.title && card.title.runs && card.title.runs[0];
        if (run && isArtistEp(run.navigationEndpoint)) add(run.navigationEndpoint, run.text, text(card.subtitle), lastThumb(card));
      }
      const r = n.musicResponsiveListItemRenderer;
      if (r) {
        const cols = (r.flexColumns || []).map((c) => c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text);
        if (isArtistEp(r.navigationEndpoint)) add(r.navigationEndpoint, text(cols[0]), text(cols[1]), lastThumb(r));
        return false;
      }
    });
    return out;
  }

  async function searchArtists(query) {
    let found = [];
    try {
      found = extractArtists(await it('search', { query, params: ARTIST_FILTER }));
    } catch (_) {
      // A rejected/changed filter value shouldn't be fatal — the unfiltered search below still has artists in it.
    }
    if (!found.length) found = extractArtists(await it('search', { query }));
    return found.slice(0, 6);
  }

  // ---------- artist page -> releases + song list ----------

  function releaseRefsFrom(res, into) {
    walk(res, (n) => {
      const r = n.musicTwoRowItemRenderer;
      if (!r) return;
      if (isAlbumEp(r.navigationEndpoint)) {
        const id = browseOf(r.navigationEndpoint).browseId;
        if (!into.has(id)) {
          const sub = (r.subtitle && r.subtitle.runs) || [];
          into.set(id, {
            browseId: id,
            title: text(r.title),
            type: (sub[0] && sub[0].text || '').trim(),
            year: (sub.map((s) => (s.text || '').trim()).find((t) => /^\d{4}$/.test(t))) || '',
          });
        }
      }
      return false;
    });
  }

  /** Every album/single/EP ref on an artist page, following each carousel's "See all" grid. Plus the id of the artist's full song list. */
  async function getArtistIndex(browseId, control) {
    const page = await it('browse', { browseId });
    const releases = new Map();
    releaseRefsFrom(page, releases);

    const more = [];
    let songsBrowseId = '';
    walk(page, (n) => {
      const car = n.musicCarouselShelfRenderer;
      if (car) {
        const hdr = car.header && car.header.musicCarouselShelfBasicHeaderRenderer;
        const b = hdr && hdr.moreContentButton && hdr.moreContentButton.buttonRenderer && browseOf(hdr.moreContentButton.buttonRenderer.navigationEndpoint);
        // Verified live: the Albums and Singles & EPs "See all" links go to an `MPAD<channelId>` browse id (+ params) and
        // return the complete grid with no continuation. The title test is a fallback in case that prefix ever changes;
        // Videos/Live/Playlists "See all"s (VL…, UC…) are skipped.
        if (b && b.browseId && (/^MPAD/.test(b.browseId) || (/\b(albums?|singles?|eps?|releases?)\b/i.test(text(hdr.title)) && !/^VL/.test(b.browseId)))) {
          more.push({ browseId: b.browseId, params: b.params });
        }
      }
      const shelf = n.musicShelfRenderer;
      if (shelf && !songsBrowseId) {
        // The artist's songs shelf is titled "Top songs" and its title links to a VL… playlist holding up to ~150 songs
        // (continuation-paged) — including songs where the artist is only a credited collaborator/feature.
        const titleRun = shelf.title && shelf.title.runs && shelf.title.runs[0];
        const ep = (titleRun && browseOf(titleRun.navigationEndpoint)) || browseOf(shelf.bottomEndpoint) || null;
        if (ep && /^VL/.test(ep.browseId || '') && /songs?/i.test((titleRun && titleRun.text) || '')) songsBrowseId = ep.browseId;
      }
    });

    for (const link of more) {
      if (control && control.cancelled) break;
      try {
        let res = await it('browse', link.params ? { browseId: link.browseId, params: link.params } : { browseId: link.browseId });
        releaseRefsFrom(res, releases);
        for (let i = 0; i < 20; i++) {
          const tok = findContinuation(res);
          if (!tok) break;
          res = await it('browse', { continuation: tok });
          releaseRefsFrom(res, releases);
        }
      } catch (_) {
        // A failed "See all" just means we fall back to what the carousel itself showed.
      }
    }
    return { releases: [...releases.values()], songsBrowseId };
  }

  // ---------- track rows ----------

  function parseRows(res, fallback) {
    const out = [];
    walk(res, (n) => {
      const r = n.musicResponsiveListItemRenderer;
      if (!r) return;
      const play = r.overlay && r.overlay.musicItemThumbnailOverlayRenderer && r.overlay.musicItemThumbnailOverlayRenderer.content && r.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer;
      const videoId = (r.playlistItemData && r.playlistItemData.videoId) || (play && play.playNavigationEndpoint && play.playNavigationEndpoint.watchEndpoint && play.playNavigationEndpoint.watchEndpoint.videoId) || '';
      if (!videoId) return false;
      if (r.musicItemRendererDisplayPolicy === 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT') return false; // unplayable
      const cols = (r.flexColumns || []).map((c) => c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text);
      const artists = [];
      const refs = [];
      let album = '';
      let albumId = '';
      // Identify artists/album by what their runs link to, not by column position — the column
      // layout differs between album pages (title, plays) and playlist-style song lists.
      for (const col of cols.slice(1)) {
        for (const run of (col && col.runs) || []) {
          if (isArtistEp(run.navigationEndpoint)) {
            artists.push(run.text);
            refs.push({ name: run.text, browseId: browseOf(run.navigationEndpoint).browseId });
          } else if (isAlbumEp(run.navigationEndpoint)) {
            album = run.text;
            albumId = browseOf(run.navigationEndpoint).browseId;
          }
        }
      }
      const fixed = r.fixedColumns && r.fixedColumns[0] && r.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer;
      const durationText = text(fixed && fixed.text);
      out.push({
        videoId,
        title: text(cols[0]),
        artists: artists.length ? artists : (fallback && fallback.artists) || [],
        artistRefs: refs.length ? refs : (fallback && fallback.artistRefs) || [],
        album: album || (fallback && fallback.album) || '',
        albumId: albumId || (fallback && fallback.albumId) || '',
        durationText,
        duration: U.parseDuration(durationText),
      });
      return false;
    });
    return out;
  }

  function parseReleaseHeader(res) {
    const info = { title: '', type: '', year: '', artists: [], artistRefs: [] };
    walk(res, (n) => {
      const h = n.musicResponsiveHeaderRenderer || n.musicDetailHeaderRenderer;
      if (!h || info.title) return;
      const sub = (h.subtitle && h.subtitle.runs) || [];
      info.title = text(h.title);
      info.type = ((sub[0] && sub[0].text) || '').trim();
      info.year = sub.map((s) => (s.text || '').trim()).find((t) => /^\d{4}$/.test(t)) || '';
      const strap = (h.straplineTextOne && h.straplineTextOne.runs) || [];
      const artistRuns = strap.concat(sub).filter((r) => isArtistEp(r.navigationEndpoint));
      info.artists = [...new Set(artistRuns.map((r) => r.text))];
      const seenIds = new Set();
      for (const r of artistRuns) {
        const id = browseOf(r.navigationEndpoint).browseId;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          info.artistRefs.push({ name: r.text, browseId: id });
        }
      }
      if (!info.artists.length && strap.length) info.artists = [text(h.straplineTextOne)];
      return false;
    });
    return info;
  }

  async function getReleaseTracks(ref) {
    const res = await it('browse', { browseId: ref.browseId });
    const head = parseReleaseHeader(res);
    const year = head.year || ref.year || '';
    const rows = parseRows(res, { artists: head.artists, artistRefs: head.artistRefs, album: head.title || ref.title, albumId: ref.browseId });
    return rows.map((t, i) => ({ ...t, releaseType: head.type || ref.type || '', year, trackNo: i + 1, releaseArtists: head.artists }));
  }

  /** Every playable track in a playlist (own or public), via the same VL… browse + continuation walk as the song list. */
  async function getPlaylistTracks(playlistId, control) {
    return getSongList(/^VL/.test(playlistId) ? playlistId : 'VL' + playlistId, control);
  }

  async function getSongList(browseId, control) {
    let res = await it('browse', { browseId });
    const rows = parseRows(res);
    for (let i = 0; i < 40; i++) {
      if (control && control.cancelled) break;
      const tok = findContinuation(res);
      if (!tok) break;
      res = await it('browse', { continuation: tok });
      rows.push(...parseRows(res));
    }
    return rows.map((t) => ({ ...t, releaseType: '', year: '', trackNo: 0 }));
  }

  async function pool(items, worker, concurrency) {
    let i = 0;
    const run = async () => {
      while (i < items.length) {
        const item = items[i++];
        await worker(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  }

  /**
   * Everything the catalog lists for one artist: all albums/singles/EPs (track by track) plus
   * the artist's own song list (which also surfaces songs they only appear on). Merged by video id.
   * onStep(done, total, label) for progress; set control.cancelled to stop early.
   * `seen` (optional, shared across calls) is a Set of release ids already read, so overlapping artists (a franchise
   * and its units, which are co-credited on the same releases) don't fetch the same release twice.
   * Also returns `credits`: every *other* artist credited on the releases this call read, with how many of them —
   * that's how a franchise's units and characters are discovered without any name searching.
   */
  async function collectArtist(artist, { onStep, control, seen } = {}) {
    const byId = new Map();
    const stats = { releases: 0, failedReleases: 0, reused: 0 };
    const readReleases = seen || new Set();
    const credits = new Map();
    const countCredits = (tracks) => {
      const ids = new Map();
      for (const t of tracks) for (const a of t.artistRefs || []) ids.set(a.browseId, a.name);
      for (const [id, name] of ids) {
        const c = credits.get(id) || { browseId: id, name, releases: 0 };
        c.releases++;
        credits.set(id, c);
      }
    };
    const keep = (t, via) => {
      if (!t.videoId) return;
      const prev = byId.get(t.videoId);
      if (prev) {
        if (!prev.via.includes(via)) prev.via.push(via);
        // Prefer the copy that knows its release (year/type) over a bare song-list row.
        if (!prev.year && t.year) Object.assign(prev, { year: t.year, releaseType: t.releaseType, album: t.album || prev.album, albumId: t.albumId || prev.albumId, trackNo: t.trackNo });
        return;
      }
      byId.set(t.videoId, { ...t, via: [via] });
    };

    onStep && onStep(0, 1, `Reading ${artist.name}'s page…`);
    const index = await getArtistIndex(artist.browseId, control);
    const total = index.releases.length + (index.songsBrowseId ? 1 : 0);
    stats.releases = index.releases.length;
    let done = 0;
    const tick = (label) => onStep && onStep(++done, total, label);

    await pool(
      index.releases,
      async (ref) => {
        if (control && control.cancelled) return;
        if (readReleases.has(ref.browseId)) {
          stats.reused++;
        } else {
          readReleases.add(ref.browseId);
          try {
            const rel = await getReleaseTracks(ref);
            countCredits(rel);
            for (const t of rel) keep(t, artist.name);
          } catch (_) {
            readReleases.delete(ref.browseId); // let a later artist retry it
            stats.failedReleases++;
          }
        }
        tick(`${artist.name}: ${ref.title}`);
      },
      3
    );
    if (index.songsBrowseId && !(control && control.cancelled)) {
      try {
        for (const t of await getSongList(index.songsBrowseId, control)) keep(t, artist.name);
      } catch (_) {
        stats.failedReleases++;
      }
      tick(`${artist.name}: song list`);

      // The song list also surfaces releases the Albums/Singles grids don't carry (verified live: e.g. "Al1", "17 CARAT").
      // Read those too, but only trust a release's *whole* track list when the artist actually owns it — for an album
      // that merely features them, keep just the songs the list already credited them for (and borrow its year/type).
      const known = new Set(index.releases.map((r) => r.browseId));
      const extra = new Map();
      for (const t of byId.values()) if (t.albumId && !known.has(t.albumId) && !readReleases.has(t.albumId) && !extra.has(t.albumId)) extra.set(t.albumId, { browseId: t.albumId, title: t.album, type: '', year: '' });
      const extraRefs = [...extra.values()].slice(0, 80);
      const nameKey = U.normalizeKey(artist.name);
      const grow = extraRefs.length;
      let extraDone = 0;
      await pool(
        extraRefs,
        async (ref) => {
          if (control && control.cancelled) return;
          readReleases.add(ref.browseId);
          try {
            const rel = await getReleaseTracks(ref);
            const owns = rel.some((t) => (t.releaseArtists || []).some((a) => U.normalizeKey(a) === nameKey));
            for (const t of rel) if (owns || byId.has(t.videoId)) keep(t, artist.name);
            if (owns) {
              stats.releases++;
              countCredits(rel);
            }
          } catch (_) {
            readReleases.delete(ref.browseId);
            stats.failedReleases++;
          }
          onStep && onStep(done + ++extraDone, total + grow, `${artist.name}: ${ref.title}`);
        },
        3
      );
    }
    return { tracks: [...byId.values()], stats, credits: [...credits.values()].filter((c) => c.browseId !== artist.browseId) };
  }

  // ---------- version-aware dedupe ----------

  const primaryKey = (t) => U.titleKey(t.title, { versions: true }) + '|' + U.normalizeKey((t.artists && t.artists[0]) || '');
  const typeRank = (t) => ({ album: 0, ep: 1, single: 2 }[(t.releaseType || '').toLowerCase()] ?? 3);
  const rankOf = (t) => [U.hasVersionMarker(t.title) ? 1 : 0, typeRank(t), parseInt(t.year, 10) || 9999, t.trackNo || 0];
  const cmpRank = (a, b) => {
    const x = rankOf(a);
    const y = rankOf(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };

  /**
   * Marks each track: `alt` (an alternate version or duplicate of a song already represented by a better copy —
   * original over "(Inst.)"/"(Japanese ver.)", album over single over compilation, earlier over later) and
   * `inPlaylist` (the target playlist already has it, by video id or by title+artist).
   */
  function classify(tracks, existing) {
    const groups = new Map();
    for (const t of tracks) {
      const k = primaryKey(t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const ids = (existing && existing.ids) || new Set();
    const keys = (existing && existing.keys) || new Set();
    for (const list of groups.values()) {
      list.sort(cmpRank);
      list.forEach((t, i) => {
        t.alt = i > 0;
        t.altReason = i === 0 ? '' : U.hasVersionMarker(t.title) ? 'alternate version' : 'also on another release';
        t.inPlaylist = ids.has(t.videoId) || keys.has(primaryKey(t));
      });
    }
    return tracks;
  }

  /** ids/keys of tracks already in a scanned playlist, for classify(). */
  function existingFrom(tracks) {
    const ids = new Set();
    const keys = new Set();
    for (const t of tracks || []) {
      if (t.videoId) ids.add(t.videoId);
      keys.add(primaryKey({ title: t.title, artists: [(t.artists && t.artists[0]) || t.artist || ''] }));
    }
    return { ids, keys };
  }

  /** Release-ordered (oldest first) groups for the preview list. */
  function groupByRelease(tracks) {
    const groups = new Map();
    for (const t of tracks) {
      const key = t.albumId || `~${t.album || 'Other'}`;
      if (!groups.has(key)) groups.set(key, { key, title: t.album || 'Other appearances', year: t.year || '', type: t.releaseType || '', tracks: [] });
      groups.get(key).tracks.push(t);
    }
    const list = [...groups.values()];
    for (const g of list) g.tracks.sort((a, b) => (a.trackNo || 999) - (b.trackNo || 999));
    list.sort((a, b) => (parseInt(a.year, 10) || 9999) - (parseInt(b.year, 10) || 9999) || a.title.localeCompare(b.title));
    return list;
  }

  // ---------- writing to playlists ----------

  /** Create an empty playlist; returns its id. Private by default. */
  async function createPlaylist(title, privacy = 'PRIVATE') {
    const res = await it('playlist/create', { title, description: '', privacyStatus: privacy });
    if (!res || !res.playlistId) throw new Error('YouTube Music did not return a playlist id');
    return res.playlistId;
  }

  /**
   * Add videos in paced batches. NOTE: no server-side duplicate protection — `dedupeOption: DEDUPE_OPTION_SKIP`
   * is accepted but verified live to be ignored (re-adding a song created a second copy), so callers must
   * filter against the playlist's real contents first (see getPlaylistTracks).
   * A failed batch is retried one at a time so a single bad id can't sink its neighbours.
   * Returns { added, skipped, failed: videoId[], cancelled }.
   */
  async function addVideos(playlistId, videoIds, { onProgress, control } = {}) {
    const BATCH = 20;
    const result = { added: 0, skipped: 0, failed: [], cancelled: false };
    const send = (ids) =>
      it('browse/edit_playlist', {
        playlistId,
        actions: ids.map((id) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id })),
      });
    const tally = (res, ids) => {
      if (res && res.status && res.status !== 'STATUS_SUCCEEDED') throw new Error(res.status);
      const added = ((res && res.playlistEditResults) || []).filter((r) => r.playlistEditVideoAddedResultData).length;
      result.added += added;
      result.skipped += ids.length - added;
    };
    for (let i = 0; i < videoIds.length; i += BATCH) {
      if (control && control.cancelled) {
        result.cancelled = true;
        break;
      }
      const ids = videoIds.slice(i, i + BATCH);
      try {
        tally(await send(ids), ids);
      } catch (_) {
        for (const id of ids) {
          try {
            tally(await send([id]), [id]);
          } catch (__) {
            result.failed.push(id);
          }
          await U.sleep(250);
        }
      }
      onProgress && onProgress(Math.min(i + BATCH, videoIds.length), videoIds.length, result);
      await U.sleep(700);
    }
    return result;
  }

  /** Character credits in anime/game catalogs are named "Character(CV.Voice Actor)" / "Character (CV: Voice Actor)"; units and groups aren't. */
  const isCharacterCredit = (name) => /\(\s*CV\b|\bCV[.:]/i.test(name || '');

  YTMO.catalog = { isCharacterCredit, searchArtists, collectArtist, getPlaylistTracks, classify, existingFrom, groupByRelease, createPlaylist, addVideos, _parse: { parseRows, parseReleaseHeader, extractArtists, releaseRefsFrom, findContinuation } };
})();
