/* global window, document, location */
// Adapter for music.youtube.com: DOM scraping AND the automation that drives
// YTM's own row menus (remove / add to playlist). Kept in one file because the
// two are tightly coupled to YTM's exact markup; registers as YTMO.ytmDom.
// site.js picks this (or spotifyDom) as the active YTMO.dom for the page.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const { sleep, waitFor, parseDuration, isVisible, requireTabVisible } = YTMO.utils;

  const SEL = {
    shelf: 'ytmusic-playlist-shelf-renderer',
    row: 'ytmusic-responsive-list-item-renderer',
    header: 'ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer, ytmusic-editable-playlist-detail-header-renderer',
    headerTitle: 'h1 yt-formatted-string, h1, .title',
    headerSubtitle: '.subtitle, .metadata',
    rowTitle: '.title-column yt-formatted-string.title, .title-column .title',
    rowTitleLink: '.title-column a[href*="watch?v="], a[href*="watch?v="]',
    rowFlexCols: '.secondary-flex-columns > yt-formatted-string',
    rowFixedCols: '.fixed-columns yt-formatted-string',
    // Tried in order (a combined selector would return whichever comes first in the DOM, e.g. the Like button).
    rowMenuBtn: [
      'ytmusic-menu-renderer button[aria-label="Action menu"]',
      'ytmusic-menu-renderer .dropdown-trigger button',
      'ytmusic-menu-renderer #button button',
      'ytmusic-menu-renderer yt-icon-button#button',
      'ytmusic-menu-renderer button:not([aria-label="Like"]):not([aria-label="Dislike"])',
    ],
    continuation: 'ytmusic-playlist-shelf-renderer ytmusic-continuation-item-renderer, ytmusic-playlist-shelf-renderer #continuations > *',
    menuPopup: 'ytmusic-menu-popup-renderer',
    menuItem: 'ytmusic-menu-navigation-item-renderer, ytmusic-menu-service-item-renderer, ytmusic-toggle-menu-service-item-renderer',
    menuItemText: 'yt-formatted-string.text, .text',
    addDialog: 'ytmusic-add-to-playlist-renderer',
    addOption: 'ytmusic-playlist-add-to-option-renderer, ytmusic-two-row-item-renderer',
    addOptionTitle: '.title, yt-formatted-string',
    libraryItem: 'ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer',
    navBar: 'ytmusic-nav-bar',
    playerBar: 'ytmusic-player-bar',
  };

  function getPageType() {
    const p = location.pathname;
    if (p === '/playlist' && new URLSearchParams(location.search).get('list')) return 'playlist';
    if (p.startsWith('/library/playlists')) return 'library';
    if (p === '/library' || p.startsWith('/library/')) return 'library';
    return 'other';
  }

  function getPlaylistId() {
    return new URLSearchParams(location.search).get('list') || '';
  }

  function text(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function getPlaylistHeader() {
    const h = document.querySelector(SEL.header);
    if (!h) return { title: document.title.replace(/ - YouTube Music$/, ''), subtitle: '' };
    return {
      title: text(h.querySelector(SEL.headerTitle)),
      subtitle: text(h.querySelector(SEL.headerSubtitle)),
    };
  }

  function getShelf() {
    return document.querySelector(SEL.shelf);
  }

  function getRows() {
    const shelf = getShelf();
    return shelf ? Array.from(shelf.querySelectorAll(SEL.row)) : [];
  }

  function videoIdFromHref(href) {
    const m = /[?&]v=([^&]+)/.exec(href || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function parseRow(row, index) {
    const link = row.querySelector(SEL.rowTitleLink);
    const title = text(row.querySelector(SEL.rowTitle)) || text(link);
    const videoId = videoIdFromHref(link?.getAttribute('href'));
    // Distinct per playlist-*entry* (not per video) — needed to move/remove this exact
    // occurrence via the edit_playlist endpoint. Only YTM's own Polymer element exposes it
    // (`row.getSetVideoId()`), and only to the page's own JS — a content script's isolated
    // world can't see it (confirmed live). Filled in afterwards by `hydrateSetVideoIds`,
    // which reads it via the background worker's MAIN-world bridge instead.
    const setVideoId = '';
    const flex = Array.from(row.querySelectorAll(SEL.rowFlexCols)).map(text);
    const fixed = Array.from(row.querySelectorAll(SEL.rowFixedCols)).map(text);
    const durationText = fixed.find((t) => /^\d+(:\d{2})+$/.test(t)) || '';
    const artistLinks = Array.from(row.querySelectorAll('.secondary-flex-columns a[href*="channel/"], .secondary-flex-columns a[href*="browse/"]'));
    const linkedArtists = artistLinks.filter((a) => !/browse\/MPRE/.test(a.getAttribute('href') || '')).map(text).filter(Boolean);
    const artists = linkedArtists.length ? linkedArtists : YTMO.utils.splitArtists(flex[0]);
    const albumLink = row.querySelector('.secondary-flex-columns a[href*="browse/MPRE"]');
    const albumId = albumLink ? ((albumLink.getAttribute('href') || '').split('browse/')[1] || '').split(/[?#]/)[0] : '';
    const artist = linkedArtists.join(', ') || flex[0] || '';
    const album = text(albumLink) || flex[1] || '';
    const unavailable = row.hasAttribute('unplayable') || row.classList.contains('unplayable') || getComputedStyle(row).opacity < 0.9;
    const imgSrc = row.querySelector('img')?.src || '';
    const thumbnail = /^data:/.test(imgSrc) ? '' : imgSrc; // lazy-load placeholder, not a real thumbnail yet
    return {
      index,
      title,
      videoId,
      setVideoId,
      artist,
      artists,
      album,
      albumId,
      thumbnail,
      releaseDate: '', // 'YYYY-MM-DD' or 'YYYY', filled in by YTMO.meta
      dateAdded: '', // YTM doesn't expose this; kept for a uniform track shape across adapters
      durationText,
      duration: parseDuration(durationText),
      unavailable,
      url: videoId ? `https://music.youtube.com/watch?v=${videoId}` : '',
      el: row,
    };
  }

  function scrapeTracks() {
    const rows = getRows();
    const seen = new Map();
    return rows.map((row, i) => {
      const t = parseRow(row, i);
      // nth occurrence of this videoId, so duplicates can be targeted individually later.
      const n = seen.get(t.videoId) || 0;
      seen.set(t.videoId, n + 1);
      t.occurrence = n;
      t.key = `${t.videoId}#${n}`;
      return t;
    });
  }

  /**
   * Fills in `setVideoId` on already-scraped tracks (see `parseRow`), via the background
   * worker's MAIN-world bridge. Matches by array position: safe as long as the shelf's rows
   * haven't been added to/removed/reordered since `scrapeTracks()` ran — true for the normal
   * scan→hydrate sequence, since nothing in between mutates the page.
   */
  async function hydrateSetVideoIds(tracks) {
    let ids = [];
    try {
      const res = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'YTMO_GET_SET_VIDEO_IDS' }, resolve));
      ids = (res && res.ok && res.ids) || [];
    } catch (_) {
      // Extension context gone (e.g. mid-reload) — leave setVideoId unset; callers handle that.
    }
    for (let i = 0; i < tracks.length; i++) tracks[i].setVideoId = ids[i] || '';
  }

  /** Re-locate a track's row element (the DOM may have re-rendered since scraping). */
  function findRowForTrack(track) {
    if (track.el && track.el.isConnected) return track.el;
    const rows = getRows();
    let n = 0;
    for (const row of rows) {
      const vid = videoIdFromHref(row.querySelector(SEL.rowTitleLink)?.getAttribute('href'));
      if (vid === track.videoId) {
        if (n === track.occurrence) return row;
        n++;
      }
    }
    return null;
  }

  /**
   * Scroll to the bottom repeatedly until YTM stops appending rows.
   * Calls onProgress(count) after each batch. Restores scroll position afterwards.
   * Pass `control: { cancelled }` (mutated externally) to stop early — used when the
   * visitor navigates to a different playlist mid-scan.
   */
  async function loadAllRows(onProgress, { maxIdleRounds = 4, roundDelay = 900, control } = {}) {
    const se = document.scrollingElement || document.documentElement;
    const startY = se.scrollTop;
    let last = -1;
    let idle = 0;
    for (let i = 0; i < 400; i++) {
      if (control?.cancelled) break;
      const count = getRows().length;
      if (onProgress) onProgress(count, count);
      if (count === last) {
        idle++;
        if (idle >= maxIdleRounds && !document.querySelector(SEL.continuation)) break;
      } else {
        idle = 0;
        last = count;
      }
      se.scrollTo(0, se.scrollHeight);
      await sleep(roundDelay);
      if (control?.cancelled) break;
    }
    // Don't jump the visitor's scroll position on whatever page they've navigated to since.
    if (!control?.cancelled) se.scrollTo(0, startY);
    return getRows().length;
  }

  function scrollToRow(track) {
    const row = findRowForTrack(track);
    if (!row) return false;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('ytmo-flash');
    setTimeout(() => row.classList.remove('ytmo-flash'), 1800);
    return true;
  }

  function getRowMenuButton(row) {
    for (const sel of SEL.rowMenuBtn) {
      const btn = row.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }

  /**
   * The Polymer overlay wrapper normally exposes an `opened` *property* (not
   * reflected as an attribute) while `aria-hidden` flips to "true" once closed —
   * checked first since it's cheap and doesn't depend on layout having settled.
   * Verified live: a closed popup's bounding box collapses to 0×0, and an open one
   * reaches its real size within ~150ms, so isVisible() below is a safe fallback
   * for row-menu variants that don't follow the property/attribute convention
   * (e.g. an owned playlist's menu has more items than a read-only one and was
   * observed not exposing `.opened` the same way).
   */
  function overlayOpen(el) {
    const wrap = el.closest('tp-yt-iron-dropdown, tp-yt-paper-dialog');
    if (wrap && (wrap.opened === true || wrap.hasAttribute('opened')) && wrap.getAttribute('aria-hidden') !== 'true') return true;
    // Fall back to genuine on-screen rendering rather than trusting only the Polymer
    // opened-state convention — some row-menu variants (e.g. an owned playlist's menu,
    // which has more items than a read-only one) don't expose `.opened`/`opened` the
    // same way, which otherwise makes an actually-open menu look closed to this check.
    return isVisible(el);
  }

  function getOpenMenuPopup() {
    return Array.from(document.querySelectorAll(SEL.menuPopup)).find(overlayOpen) || null;
  }

  /**
   * Menu items with their label and YTM's icon identifier (e.g. "ADD_TO_PLAYLIST",
   * "REMOVE_FROM_PLAYLIST"). The icon id is a DOM attribute and doesn't change
   * with the UI language, so automation prefers it over the text.
   */
  function getMenuItems(popup) {
    return Array.from(popup.querySelectorAll(SEL.menuItem)).map((el) => {
      const iconEl = el.querySelector('yt-icon');
      const icon = ((iconEl && (iconEl.getAttribute('icon') || iconEl.icon)) || '').replace(/^yt-icons:/, '').toUpperCase();
      return { el, icon, text: text(el.querySelector(SEL.menuItemText)) || text(el) };
    });
  }

  function getOpenAddDialog() {
    return Array.from(document.querySelectorAll(SEL.addDialog)).find(overlayOpen) || null;
  }

  function getAddDialogOptions(dialog) {
    return Array.from(dialog.querySelectorAll(SEL.addOption)).map((el) => ({
      el,
      title: text(el.querySelector(SEL.addOptionTitle)) || text(el),
    }));
  }

  /** Playlists listed on the Library page. */
  function getLibraryPlaylists() {
    const out = [];
    const seen = new Set();
    for (const item of document.querySelectorAll(SEL.libraryItem)) {
      const a = item.querySelector('a[href*="playlist?list="]');
      if (!a) continue;
      const id = new URLSearchParams(a.getAttribute('href').split('?')[1] || '').get('list');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        title: text(item.querySelector('.title')) || text(a) || id,
        subtitle: text(item.querySelector('.subtitle, .secondary-flex-columns')),
        el: item,
      });
    }
    return out;
  }

  /** Subscribe to YTM's SPA navigation. */
  function onNavigate(cb) {
    let lastHref = location.href;
    const fire = () => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        cb();
      }
    };
    window.addEventListener('yt-navigate-finish', () => setTimeout(fire, 50));
    window.addEventListener('popstate', () => setTimeout(fire, 50));
    setInterval(fire, 700);
  }

  function getLayoutInsets() {
    const nav = document.querySelector(SEL.navBar);
    const bar = document.querySelector(SEL.playerBar);
    return {
      top: nav ? nav.getBoundingClientRect().height || 64 : 64,
      bottom: bar && isVisible(bar) ? bar.getBoundingClientRect().height : 0,
    };
  }

  // ---------- automation: drives YTM's row menu (remove / save to playlist) ----------

  function pressEscape(target) {
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    (target || document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', opts));
    (target || document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  /** Close any open YTM menu/dialog. */
  async function closeOverlays() {
    for (let i = 0; i < 3; i++) {
      const popup = getOpenMenuPopup();
      const dialog = getOpenAddDialog();
      if (!popup && !dialog) return;
      const dropdown = popup?.closest('tp-yt-iron-dropdown');
      const paperDialog = dialog?.closest('tp-yt-paper-dialog');
      // 0) Polymer overlays expose close(); this is the reliable path
      for (const w of [dropdown, paperDialog]) if (w && typeof w.close === 'function') w.close();
      // 1) close button on dialogs
      const closeBtn = paperDialog?.querySelector('button[aria-label="Dismiss"], button[aria-label="Close"], #close-button button, .close-button');
      if (closeBtn) closeBtn.click();
      // 2) Escape on the overlay
      pressEscape(dropdown || paperDialog || popup || dialog);
      // 3) click the backdrop
      const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
      if (backdrop && isVisible(backdrop)) backdrop.click();
      await sleep(250);
    }
  }

  function clickable(el) {
    return el.querySelector('tp-yt-paper-item, a, button') || el;
  }

  /**
   * Diagnostics for when a menu genuinely never opens (as opposed to the tab being
   * backgrounded, already handled by requireTabVisible). Reports whether YTM's shared
   * popup element exists at all and what state its overlay wrapper is actually in,
   * since "Menu did not open" alone doesn't say whether nothing happened or something
   * got stuck half-open.
   */
  function describeMenuFailure() {
    const anyPopup = document.querySelector(SEL.menuPopup);
    if (!anyPopup) return 'no menu element appeared in the page at all';
    const wrap = anyPopup.closest('tp-yt-iron-dropdown, tp-yt-paper-dialog');
    const itemCount = getMenuItems(anyPopup).length;
    return `a menu element exists but didn't open: opened=${wrap?.opened}, aria-hidden=${wrap?.getAttribute('aria-hidden')}, items=${itemCount}`;
  }

  async function openRowMenu(row, delay) {
    requireTabVisible();
    await closeOverlays();
    row.scrollIntoView({ block: 'center' });
    await sleep(120);
    // Retry once: a menu that fails to open is sometimes a one-off missed click (e.g. the
    // row hadn't finished settling into view yet) rather than a persistent problem, and a
    // clean close-then-retry recovers it without giving up on the whole track.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const btn = getRowMenuButton(row);
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

  // YTM icon identifiers for the two menu items we drive. These don't depend on the UI language.
  const ICONS = {
    remove: ['REMOVE_FROM_PLAYLIST', 'DELETE', 'REMOVE'],
    save: ['ADD_TO_PLAYLIST', 'PLAYLIST_ADD', 'SAVE_PLAYLIST'],
  };

  /** Find a menu item by icon id first, falling back to the (localizable) text pattern from settings. */
  function findItem(popup, kind, pattern) {
    const items = getMenuItems(popup);
    const byIcon = items.find((i) => ICONS[kind].includes(i.icon));
    if (byIcon) return byIcon;
    let re;
    try {
      re = new RegExp(pattern, 'i');
    } catch (_) {
      return null;
    }
    return items.find((i) => re.test(i.text)) || null;
  }

  /** Remove one track from the current playlist through its row menu. */
  async function removeTrack(track, settings) {
    const row = findRowForTrack(track);
    if (!row) throw new Error('Row no longer in page');
    const popup = await openRowMenu(row, settings.stepDelay);
    const item = findItem(popup, 'remove', settings.ytm.labelRemove);
    if (!item) {
      await closeOverlays();
      throw new Error('No "Remove from playlist" item (not your playlist?)');
    }
    clickable(item.el).click();
    const gone = await waitFor(() => !row.isConnected || !isVisible(row), { timeout: 5000 });
    await sleep(settings.stepDelay);
    if (!gone) throw new Error('Row did not disappear after remove');
  }

  /** Open the "Save to playlist" dialog for a row and return its options. */
  async function openSaveDialog(row, settings) {
    const popup = await openRowMenu(row, settings.stepDelay);
    const item = findItem(popup, 'save', settings.ytm.labelSave);
    if (!item) {
      await closeOverlays();
      throw new Error('No "Save to playlist" item in menu');
    }
    clickable(item.el).click();
    const dialog = await waitFor(
      () => {
        const d = getOpenAddDialog();
        return d && getAddDialogOptions(d).length ? d : null;
      },
      { timeout: Math.max(4000, settings.stepDelay * 6) }
    );
    if (!dialog) throw new Error('Save-to-playlist dialog did not open');
    await sleep(Math.min(settings.stepDelay, 300));
    return dialog;
  }

  /** Read the names of the user's playlists from the save dialog (uses the first row). */
  async function listTargetPlaylists(track, settings) {
    const row = findRowForTrack(track);
    if (!row) throw new Error('Row no longer in page');
    const dialog = await openSaveDialog(row, settings);
    const names = getAddDialogOptions(dialog).map((o) => o.title).filter(Boolean);
    await closeOverlays();
    return names;
  }

  async function addTrackToPlaylist(track, targetName, settings) {
    const row = findRowForTrack(track);
    if (!row) throw new Error('Row no longer in page');
    const dialog = await openSaveDialog(row, settings);
    const option = getAddDialogOptions(dialog).find((o) => o.title === targetName);
    if (!option) {
      await closeOverlays();
      throw new Error(`Playlist "${targetName}" not in dialog`);
    }
    clickable(option.el).click();
    await waitFor(() => !getOpenAddDialog(), { timeout: 5000 });
    await sleep(settings.stepDelay);
  }

  /**
   * Move one playlist entry to be immediately before another, via the same InnerTube
   * endpoint (`browse/edit_playlist`, action `ACTION_MOVE_VIDEO_BEFORE`) YTM's own client
   * calls when you drag-reorder a row — captured live from a real drag, since content
   * scripts can't simulate the trusted drag gesture the on-page UI requires. Both ids are
   * `setVideoId`s (per playlist-*entry*, not per video — see `parseRow`), not video ids.
   * Reordering a whole playlist to a target order needs `length-1` calls to this, one per
   * adjacent pair in the target order, issued from the *last* pair back to the *first* —
   * going forward instead does not converge to the right order.
   */
  async function moveItemBefore(playlistId, setVideoId, beforeSetVideoId, settings) {
    await YTMO.meta.innertube('browse/edit_playlist', {
      playlistId,
      actions: [{ action: 'ACTION_MOVE_VIDEO_BEFORE', setVideoId, movedSetVideoIdSuccessor: beforeSetVideoId }],
    });
    await sleep(settings.stepDelay);
  }

  YTMO.ytmDom = {
    SEL,
    serviceName: 'YouTube Music',
    trackIdLabel: 'Video ID',
    scanHint: 'Scanning scrolls the page to the bottom so YouTube loads all tracks, then reads them.',
    capabilities: { autoScroll: true, releaseDates: true, dateAdded: false, libraryPage: true, removeVerified: true, addVerified: true, physicalReorder: true },
    getPageType,
    getPlaylistId,
    getPlaylistHeader,
    getShelf,
    getRows,
    parseRow,
    scrapeTracks,
    hydrateSetVideoIds,
    findRowForTrack,
    loadAllRows,
    scrollToRow,
    getRowMenuButton,
    getOpenMenuPopup,
    getMenuItems,
    getOpenAddDialog,
    getAddDialogOptions,
    getLibraryPlaylists,
    onNavigate,
    getLayoutInsets,
    closeOverlays,
    removeTrack,
    addTrackToPlaylist,
    listTargetPlaylists,
    moveItemBefore,
  };
})();
