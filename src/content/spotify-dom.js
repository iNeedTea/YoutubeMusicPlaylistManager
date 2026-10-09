/* global window, document, location */
// Adapter for open.spotify.com. Registers as YTMO.spotifyDom; site.js picks it
// as the active YTMO.dom on Spotify pages.
//
// Two structural differences from YTM drove the design here, found by testing
// against real (public, logged-out) playlists:
//
// 1. Spotify's track list is virtualized with a sliding window (rows outside
//    the viewport are unmounted, not just left alone) and — unlike YTM — it
//    only re-renders in response to a *user-driven* scroll (real mouse wheel /
//    scrollbar drag). Setting `.scrollTop` or dispatching synthetic wheel/
//    scroll events from script moves the scroll position but does not load
//    more rows. So instead of auto-scrolling (as ytm-dom.js does), this
//    adapter passively accumulates every row it has ever seen via a
//    MutationObserver, and keeps collecting for as long as the panel is open
//    while the visitor scrolls normally. `loadAllRows` still makes a best
//    effort at a programmatic scroll (harmless if ignored) and reports
//    progress, but the panel UI is honest that manual scrolling may be needed.
//
// 2. Row menu items have no per-item test id or icon name (unlike YTM's
//    `icon="ADD_TO_PLAYLIST"`), so language-independent matching is only
//    possible for "Add to playlist" (always the first item, opens on hover,
//    and its plus-icon SVG path is a stable signature). "Remove from this
//    playlist" only appears on playlists you own and could not be verified
//    live in this session (no logged-in test account); it is matched by a
//    configurable text pattern, same as YTM's fallback path.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const { sleep, waitFor, parseDuration, isVisible, requireTabVisible } = YTMO.utils;

  const SEL = {
    tracklist: '[data-testid="playlist-tracklist"]',
    row: '[data-testid="tracklist-row"]',
    titleLink: '[data-testid="internal-track-link"]',
    moreBtn: '[data-testid="more-button"]',
    header: '[data-testid="playlist-page"]',
  };

  function text(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function idFromHref(href) {
    const m = /\/track\/([^/?#]+)/.exec(href || '');
    return m ? m[1] : '';
  }

  function getPageType() {
    if (/^\/playlist\/[^/]+/.test(location.pathname)) return 'playlist';
    return 'other';
  }

  function getPlaylistId() {
    return (location.pathname.match(/^\/playlist\/([^/]+)/) || [])[1] || '';
  }

  function getPlaylistHeader() {
    const header = document.querySelector(SEL.header);
    const h1 = header?.querySelector('h1');
    const title = text(h1) || document.title.replace(/ \| Spotify Playlist$/, '').replace(/ - playlist by .*/, '');
    // Second text line under the title is usually the playlist description (may be empty).
    const spans = header ? [...header.querySelectorAll('span[data-encore-id="text"]')] : [];
    const subtitle = text(spans[1]);
    return { title, subtitle };
  }

  /** Total track count from the header ("... • 50 songs, about 2 hr 45 min"), if shown. */
  function getExpectedTotal() {
    const header = document.querySelector(SEL.header);
    const m = /([\d,]+)\s+songs?/i.exec(text(header));
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
  }

  function getRows() {
    return Array.from(document.querySelectorAll(SEL.row));
  }

  // Absolute "24 Jul 2026" / relative "5 days ago", "today", "yesterday" -> approximate ISO date.
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function parseDateAdded(s) {
    s = (s || '').trim();
    if (!s) return '';
    const abs = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(s);
    if (abs) {
      const mon = MONTHS[abs[2].slice(0, 3).toLowerCase()];
      if (mon != null) {
        const d = new Date(Date.UTC(+abs[3], mon, +abs[1]));
        return d.toISOString().slice(0, 10);
      }
    }
    if (/^today$/i.test(s)) return new Date().toISOString().slice(0, 10);
    const rel = /^(\d+)\s+(day|week|month|year)s?\s+ago$/i.exec(s);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const days = { day: 1, week: 7, month: 30, year: 365 }[rel[2].toLowerCase()];
      const d = new Date(Date.now() - n * days * 86400000);
      return d.toISOString().slice(0, 10);
    }
    if (/^yesterday$/i.test(s)) return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return '';
  }

  function parseRow(row, index) {
    const link = row.querySelector(SEL.titleLink);
    const title = text(link);
    const trackId = idFromHref(link?.getAttribute('href'));
    const cells = Array.from(row.querySelectorAll('[role="gridcell"]'));
    const artistLinks = Array.from(row.querySelectorAll('a[href^="/artist/"]'));
    const artists = artistLinks.map(text).filter(Boolean);
    const artist = artists.join(', ');
    const albumLink = row.querySelector('a[href^="/album/"]');
    const album = text(albumLink);
    const dateAddedText = text(cells[3]);
    const durationText = text(cells[cells.length - 1]);
    const posText = text(cells[0]);
    const pos = parseInt(posText, 10);
    return {
      index: Number.isFinite(pos) ? pos - 1 : index,
      title,
      videoId: trackId, // Spotify track id; field kept as `videoId` for a uniform track shape across adapters
      artist,
      artists,
      album,
      albumId: '',
      thumbnail: row.querySelector('img')?.src || '',
      releaseDate: '', // not available for Spotify (see README)
      dateAdded: parseDateAdded(dateAddedText),
      dateAddedText,
      durationText,
      duration: parseDuration(durationText),
      unavailable: row.getAttribute('aria-disabled') === 'true' || row.classList.contains('LSuLZ5tDlnaMk3HPcPl8'),
      url: trackId ? `https://open.spotify.com/track/${trackId}` : '',
      el: row,
    };
  }

  // ---------- passive, scroll-driven collection (see file header comment) ----------

  let collected = new Map(); // videoId#occurrence key -> track, across the whole scan session
  let observer = null;
  let observedList = null;
  let occurrenceCounters = new Map();

  function harvestVisible() {
    for (const row of getRows()) {
      const t = parseRow(row, -1);
      if (!t.videoId) continue;
      // Key by playlist position, which Spotify keeps stable and accurate even while virtualized,
      // so re-harvesting the same visible row twice doesn't create a duplicate entry.
      const posKey = 'pos:' + t.index;
      const n = occurrenceCounters.get(t.videoId) || 0;
      // Only assign a fresh occurrence number the first time this position is seen.
      if (!collected.has(posKey)) {
        t.occurrence = n;
        occurrenceCounters.set(t.videoId, n + 1);
      } else {
        t.occurrence = collected.get(posKey).occurrence;
      }
      t.key = `${t.videoId}#${t.occurrence}`;
      collected.set(posKey, t);
    }
  }

  function ensureObserving() {
    const list = document.querySelector(SEL.tracklist);
    if (!list) return false;
    if (observer && observedList === list) return true;
    if (observer) observer.disconnect();
    harvestVisible();
    observer = new MutationObserver(() => harvestVisible());
    observer.observe(list, { childList: true, subtree: true });
    observedList = list;
    return true;
  }

  function resetCollection() {
    if (observer) observer.disconnect();
    observer = null;
    observedList = null;
    collected = new Map();
    occurrenceCounters = new Map();
  }

  function scrapeTracks() {
    ensureObserving();
    harvestVisible();
    return [...collected.values()].sort((a, b) => a.index - b.index);
  }

  function findRowForTrack(track) {
    if (track.el && track.el.isConnected) return track.el;
    // Fall back to matching by currently-visible position (rows are recycled by
    // the virtualizer, so a stale element reference is common once you've scrolled).
    for (const row of getRows()) {
      const cell = row.querySelector('[role="gridcell"]');
      const pos = parseInt(text(cell), 10);
      if (pos - 1 === track.index) return row;
    }
    return null;
  }

  function findScrollableAncestor(el) {
    let node = el;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 5) return node;
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Best-effort: starts passive collection and, for as long as it's called,
   * nudges the scroll position (works in some contexts; harmless if not) while
   * reporting how many tracks have been collected so far. Unlike ytm-dom.js's
   * version this does NOT guarantee the full list gets loaded — see the file
   * header comment. Returns the count collected when it stops.
   * Pass `control: { cancelled }` (mutated externally) to stop early — used when
   * the visitor navigates to a different playlist mid-scan.
   */
  async function loadAllRows(onProgress, { rounds = 10, roundDelay = 500, control } = {}) {
    resetCollection();
    ensureObserving();
    let lastCount = -1;
    let idle = 0;
    for (let i = 0; i < rounds; i++) {
      if (control?.cancelled) break;
      const rows = getRows();
      const anchor = rows[rows.length - 1];
      const scroller = anchor && findScrollableAncestor(anchor);
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      if (anchor) anchor.scrollIntoView({ block: 'end' });
      await sleep(roundDelay);
      if (control?.cancelled) break;
      harvestVisible();
      const count = collected.size;
      const total = getExpectedTotal();
      if (onProgress) onProgress(count, total);
      if (count === lastCount) {
        idle++;
        if (idle >= 3) break;
      } else {
        idle = 0;
        lastCount = count;
      }
    }
    return collected.size;
  }

  function scrollToRow(track) {
    const row = findRowForTrack(track);
    if (!row) return false;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('ytmo-flash');
    setTimeout(() => row.classList.remove('ytmo-flash'), 1800);
    return true;
  }

  function getLibraryPlaylists() {
    // "Your Library" is a sidebar panel, not scraped in this version — the
    // tagged-playlists list (sourced from extension storage) still works everywhere.
    return [];
  }

  function onNavigate(cb) {
    let lastHref = location.href;
    const fire = () => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        resetCollection();
        cb();
      }
    };
    window.addEventListener('popstate', () => setTimeout(fire, 50));
    setInterval(fire, 700);
  }

  function getLayoutInsets() {
    const top = document.querySelector('[data-testid="topbar"]');
    const bar = document.querySelector('[data-testid="now-playing-bar"]');
    return {
      top: top ? top.getBoundingClientRect().height || 64 : 64,
      bottom: bar && isVisible(bar) ? bar.getBoundingClientRect().height : 0,
    };
  }

  // ---------- automation: drives Spotify's row context menu ----------

  function getOpenMenuPopup() {
    return Array.from(document.querySelectorAll('[role="menu"]')).find(isVisible) || null;
  }

  function getMenuItems(popup) {
    return Array.from(popup.querySelectorAll('[role="menuitem"]')).map((el) => ({
      el,
      expanded: el.getAttribute('aria-expanded'),
      iconPath: el.querySelector('svg path')?.getAttribute('d') || '',
      text: text(el),
    }));
  }

  async function closeOverlays() {
    for (let i = 0; i < 3; i++) {
      const popup = getOpenMenuPopup();
      if (!popup) return;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      document.body.click();
      await sleep(200);
    }
  }

  /** See ytm-dom.js's version of this for why: reports what actually happened instead of nothing. */
  function describeMenuFailure() {
    const anyPopup = document.querySelector('[role="menu"]');
    if (!anyPopup) return 'no menu element appeared in the page at all';
    const itemCount = getMenuItems(anyPopup).length;
    return `a menu element exists but didn't open: visible=${isVisible(anyPopup)}, items=${itemCount}`;
  }

  async function openRowMenu(row, delay) {
    requireTabVisible();
    await closeOverlays();
    row.scrollIntoView({ block: 'center' });
    await sleep(120);
    // Retry once: a menu that fails to open is sometimes a one-off missed click rather
    // than a persistent problem, and a clean close-then-retry recovers it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const btn = row.querySelector(SEL.moreBtn);
      if (!btn) throw new Error('Row menu button not found');
      btn.click();
      const popup = await waitFor(
        () => {
          const p = getOpenMenuPopup();
          return p && getMenuItems(p).length ? p : null;
        },
        { timeout: Math.max(3000, delay * 4) }
      );
      if (popup) {
        await sleep(Math.min(delay, 300));
        return popup;
      }
      requireTabVisible(); // the tab may have been backgrounded partway through the wait
      if (attempt === 1) {
        await closeOverlays();
        await sleep(300);
      }
    }
    throw new Error(`Menu did not open after 2 attempts (${describeMenuFailure()})`);
  }

  // Stable "+" plus-icon path used by the "Add to playlist" menu item, verified live
  // against open.spotify.com. Combined with "first item in the menu" as a fallback signal.
  const ADD_ICON_PATH = 'M15.25 8a.75.75 0 0 1-.75.75H8.75v5.75a.75.75 0 0 1-1.5 0V8.75H1.5a.75.75 0 0 1 0-1.5h5.75V1.5a.75.75 0 0 1 1.5 0v5.75h5.75a.75.75 0 0 1 .75.75';

  function findAddItem(popup, pattern) {
    const items = getMenuItems(popup);
    const byIcon = items.find((i) => i.iconPath === ADD_ICON_PATH);
    if (byIcon) return byIcon;
    if (items[0]?.expanded != null) return items[0]; // first item opening a submenu
    try {
      const re = new RegExp(pattern, 'i');
      return items.find((i) => re.test(i.text)) || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * "Remove from this playlist" has no icon signature we could capture (only
   * verified on owned playlists, which this session had no login for), so it's
   * matched by text only. Adjust the pattern in the popup if it doesn't match.
   */
  function findRemoveItem(popup, pattern) {
    const items = getMenuItems(popup);
    try {
      const re = new RegExp(pattern, 'i');
      return items.find((i) => re.test(i.text)) || null;
    } catch (_) {
      return null;
    }
  }

  async function removeTrack(track, settings) {
    const row = findRowForTrack(track);
    if (!row) throw new Error('Row no longer in page');
    const popup = await openRowMenu(row, settings.stepDelay);
    const item = findRemoveItem(popup, settings.spotify.labelRemove);
    if (!item) {
      await closeOverlays();
      throw new Error('No "Remove from this playlist" item found (not your playlist, or the label needs adjusting in settings)');
    }
    item.el.click();
    const gone = await waitFor(() => !row.isConnected || !isVisible(row), { timeout: 5000 });
    await sleep(settings.stepDelay);
    if (!gone) throw new Error('Row did not disappear after remove');
  }

  /** Open "Add to playlist" (hover reveals its submenu) and return the submenu element. */
  async function openAddSubmenu(row, settings) {
    const popup = await openRowMenu(row, settings.stepDelay);
    const item = findAddItem(popup, settings.spotify.labelAdd);
    if (!item) {
      await closeOverlays();
      throw new Error('No "Add to playlist" item in menu');
    }
    item.el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    item.el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const submenu = await waitFor(
      () => {
        const menus = Array.from(document.querySelectorAll('[role="menu"]')).filter(isVisible);
        const sub = menus.find((m) => m !== popup);
        return sub && sub.querySelector('input[role="searchbox"]') ? sub : null;
      },
      { timeout: Math.max(3000, settings.stepDelay * 4) }
    );
    if (!submenu) throw new Error('"Add to playlist" submenu did not open');
    await sleep(Math.min(settings.stepDelay, 300));
    return submenu;
  }

  function submenuPlaylistItems(submenu) {
    return Array.from(submenu.querySelectorAll('[role="menuitem"]'))
      .map((el) => ({ el, text: text(el) }))
      .filter((i) => i.text && i.text !== 'New playlist');
  }

  async function listTargetPlaylists(track, settings) {
    const row = findRowForTrack(track);
    if (!row) throw new Error('Row no longer in page');
    const submenu = await openAddSubmenu(row, settings);
    const names = submenuPlaylistItems(submenu).map((i) => i.text);
    await closeOverlays();
    return names;
  }

  async function addTrackToPlaylist(track, targetName, settings) {
    const row = findRowForTrack(track);
    if (!row) throw new Error('Row no longer in page');
    const submenu = await openAddSubmenu(row, settings);
    // Narrow the list via the search box first, since long libraries only render a partial list otherwise.
    const search = submenu.querySelector('input[role="searchbox"]');
    if (search) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(search, targetName);
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(Math.min(settings.stepDelay, 400));
    }
    const option = submenuPlaylistItems(submenu).find((i) => i.text === targetName || i.text.startsWith(targetName));
    if (!option) {
      await closeOverlays();
      throw new Error(`Playlist "${targetName}" not found in the submenu list`);
    }
    option.el.click();
    await waitFor(() => !getOpenMenuPopup(), { timeout: 5000 });
    await sleep(settings.stepDelay);
  }

  YTMO.spotifyDom = {
    SEL,
    serviceName: 'Spotify',
    trackIdLabel: 'Track ID',
    scanHint:
      'Spotify only loads more tracks as you scroll — clicking Scan starts collecting and makes a best-effort attempt to advance the list, but for long playlists you may need to scroll down manually while this panel is open. The count below updates live.',
    capabilities: { autoScroll: false, releaseDates: false, dateAdded: true, libraryPage: false, removeVerified: false, addVerified: false, physicalReorder: false },
    getPageType,
    getPlaylistId,
    getPlaylistHeader,
    getExpectedTotal,
    getRows,
    parseRow,
    scrapeTracks,
    findRowForTrack,
    loadAllRows,
    scrollToRow,
    getLibraryPlaylists,
    onNavigate,
    getLayoutInsets,
    closeOverlays,
    removeTrack,
    addTrackToPlaylist,
    listTargetPlaylists,
  };
})();
