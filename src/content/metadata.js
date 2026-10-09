/* global window, document */
// Release dates. Playlist rows don't show them, so we ask YouTube Music's own
// internal ("InnerTube") endpoints from the page origin:
//   - browse(albumId) -> the album header's year ("Single • 1997"). Authoritative.
//   - player(videoId) -> the video's publish date. Exact, but for older songs it is
//     only the date the catalogue was uploaded, so it's used just to refine the
//     album year when both agree, or on its own when the track has no album.
// Results are cached in chrome.storage so a playlist is only looked up once.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const storage = YTMO.storage;

  let cfg = null;

  /**
   * API key/client version/visitor id/account index, read from YTM's inline ytcfg script
   * (plain text-content regex matching — cross-world-safe, unlike reading `window.ytcfg`
   * itself, which a content script's isolated world can't see; see `hydrateSetVideoIds` in
   * ytm-dom.js for the same isolation issue hitting a JS property instead of a text blob).
   * authuser/visitorData are only actually needed for a *mutating* call (edit_playlist) —
   * the read-only browse/player lookups this was originally written for work without them.
   */
  function innertubeConfig() {
    if (cfg) return cfg;
    let key = '';
    let version = '';
    let authuser = '0';
    let visitorData = '';
    let pageId = '';
    for (const s of document.querySelectorAll('script:not([src])')) {
      const t = s.textContent || '';
      if (!t.includes('INNERTUBE_API_KEY')) continue;
      key = (/"INNERTUBE_API_KEY":"([^"]+)"/.exec(t) || [])[1] || '';
      version = (/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(t) || [])[1] || '';
      authuser = (/"SESSION_INDEX":"?([^",}]*)"?/.exec(t) || [])[1] || '0';
      visitorData = (/"VISITOR_DATA":"([^"]+)"/.exec(t) || [])[1] || '';
      // The account's "delegated session" id. Required as X-Goog-PageId on a mutating call
      // (edit_playlist) — confirmed live: every other header below was already correct and
      // still 403'd until this one was added, with no more specific reason given than
      // "PERMISSION_DENIED" / "Sorry, something went wrong."
      pageId = (/"DELEGATED_SESSION_ID":"?([^",}]*)"?/.exec(t) || [])[1] || '';
      break;
    }
    cfg = { key, version: version || '1.20250101.01.00', authuser, visitorData, pageId };
    return cfg;
  }

  /**
   * The read-only lookups this was written for (browse(albumId), player(videoId)) work with
   * just cookies + API key. A mutating call like browse/edit_playlist (used for physical
   * reordering) doesn't — it 401s without this — because YouTube requires proof the caller
   * actually holds the session, not just that the cookie is attached: a SAPISID-hash
   * signature the account's own JS computes the same way. SAPISID (or its __Secure- variant)
   * is deliberately not HttpOnly, precisely so page/content-script JS can read it for this.
   * Origin must exactly match X-Origin below (both endpoints care) — hard-coded since this
   * file is YTM-only. Returns null (headers omitted) if the cookie isn't present, e.g. logged
   * out, in which case the request will 401 on its own with a clearer server-side reason.
   */
  async function sapisidHashHeader() {
    const origin = 'https://music.youtube.com';
    const get = (name) => (new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie) || [])[1];
    const sapisid = get('__Secure-3PAPISID') || get('SAPISID');
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sapisid} ${origin}`));
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }

  async function innertube(endpoint, body) {
    const c = innertubeConfig();
    const auth = await sapisidHashHeader();
    // The real client never sends `key=` alongside cookie/SAPISIDHASH auth (confirmed from a
    // captured real request) — only as a fallback for the unauthenticated read lookups this
    // was originally written for. Sending both together 403s the authenticated (write) calls.
    const keyParam = !auth && c.key ? '?key=' + encodeURIComponent(c.key) : '';
    const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}${keyParam}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': c.version,
        ...(auth
          ? {
              Authorization: auth,
              'X-Origin': 'https://music.youtube.com',
              'X-Goog-AuthUser': c.authuser,
              'X-Goog-Visitor-Id': c.visitorData,
              'X-Youtube-Bootstrap-Logged-In': 'true',
              'X-Goog-PageId': c.pageId,
            }
          : {}),
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: c.version, hl: 'en', visitorData: c.visitorData } },
        ...body,
      }),
    });
    if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`);
    return res.json();
  }

  async function fetchVideoDate(videoId) {
    const j = await innertube('player', { videoId });
    const mf = (j.microformat && j.microformat.microformatDataRenderer) || {};
    return String(mf.publishDate || mf.uploadDate || '').slice(0, 10);
  }

  async function fetchAlbumYear(albumId) {
    const j = await innertube('browse', { browseId: albumId });
    let year = '';
    (function walk(o, depth) {
      if (year || !o || typeof o !== 'object' || depth > 60) return;
      if (Array.isArray(o)) {
        for (const v of o) walk(v, depth + 1);
        return;
      }
      for (const k of Object.keys(o)) {
        if ((k === 'musicResponsiveHeaderRenderer' || k === 'musicDetailHeaderRenderer') && o[k]) {
          const runs = (o[k].subtitle && o[k].subtitle.runs) || [];
          const y = runs.map((r) => String(r.text || '').trim()).find((t) => /^\d{4}$/.test(t));
          if (y) {
            year = y;
            return;
          }
        }
        walk(o[k], depth + 1);
      }
    })(j, 0);
    return year;
  }

  /** Run `worker` over `items` with limited concurrency; worker errors are swallowed (the worker records them). */
  async function pool(items, worker, concurrency, onEach) {
    let i = 0;
    const run = async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          await worker(item);
        } catch (_) {
          /* recorded by worker */
        }
        if (onEach) onEach();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  }

  function combine(albumYear, videoDate) {
    if (albumYear) return videoDate && videoDate.startsWith(albumYear) ? videoDate : albumYear;
    return videoDate || '';
  }

  async function loadCache() {
    const { releaseCache } = await storage.get('releaseCache');
    return { videos: {}, albums: {}, ...(releaseCache || {}) };
  }

  function apply(tracks, cache) {
    for (const t of tracks) {
      t.releaseDate = combine(t.albumId ? cache.albums[t.albumId] || '' : '', cache.videos[t.videoId] || '');
    }
  }

  /** Fill releaseDate from the cache only (no network). Returns how many tracks are still missing a date. */
  async function applyCachedDates(tracks) {
    apply(tracks, await loadCache());
    return tracks.filter((t) => !t.releaseDate).length;
  }

  /**
   * Look up every unknown album and video, cache, and set track.releaseDate.
   * onProgress(done, total, failed); set control.cancelled = true to stop early.
   */
  async function resolveReleaseDates(tracks, { onProgress, control } = {}) {
    const cache = await loadCache();
    const albumIds = [...new Set(tracks.map((t) => t.albumId).filter(Boolean))].filter((id) => !(id in cache.albums));
    const videoIds = [...new Set(tracks.map((t) => t.videoId).filter(Boolean))].filter((id) => !(id in cache.videos));
    const total = albumIds.length + videoIds.length;
    let done = 0;
    let failed = 0;
    const tick = () => {
      done++;
      if (onProgress) onProgress(done, total, failed);
    };
    const stopped = () => !!(control && control.cancelled);
    await pool(
      albumIds,
      async (id) => {
        if (stopped()) return;
        try {
          cache.albums[id] = await fetchAlbumYear(id);
        } catch (_) {
          failed++;
        }
      },
      3,
      tick
    );
    await pool(
      videoIds,
      async (id) => {
        if (stopped()) return;
        try {
          cache.videos[id] = await fetchVideoDate(id);
        } catch (_) {
          failed++;
        }
      },
      4,
      tick
    );
    await storage.set({ releaseCache: cache });
    apply(tracks, cache);
    return { total, failed, cancelled: stopped(), missing: tracks.filter((t) => !t.releaseDate).length };
  }

  YTMO.meta = { innertubeConfig, innertube, applyCachedDates, resolveReleaseDates };
})();
