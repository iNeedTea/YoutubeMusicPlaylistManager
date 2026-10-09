/* global window, document, chrome, navigator */
// The organizer side panel. Rendered inside a Shadow DOM so the host site's
// styles and ours never collide. Plain DOM + template strings (via setHTML);
// no framework. This file owns all data/state/actions; visual rendering is
// delegated to the active layout module (YTMO.layouts.<classic|rail|console|spine>)
// chosen by the saved theme, so switching layouts never touches this logic.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const { escapeHtml: h, setHTML, titleKey, artistKey, normalizeKey, hasVersionMarker, formatDuration, formatTotal, toCSV, download, safeFilename, debounce } =
    YTMO.utils;
  const dom = YTMO.dom;
  const auto = YTMO.auto;
  const meta = YTMO.meta;
  const storage = YTMO.storage;
  const metaKey = () => YTMO.site.metaKey(state.playlistId);

  // key, label, [label for dir=1, label for dir=-1], kind: 'none' | 'release' (needs YTMO.meta lookup) | 'added' (already scraped)
  function getSorts() {
    const caps = dom.capabilities;
    const list = [['index', 'Playlist order', null, 'none']];
    // Only offered once the user has actually dragged a row — before that it's identical
    // to "Playlist order" and would just be a confusing extra option.
    if (state.hasCustomOrder) list.push(['custom', 'Custom order (dragged)', null, 'none']);
    list.push(
      ['title', 'Title', ['A → Z', 'Z → A'], 'none'],
      ['titleArtist', 'Title, then artist', ['A → Z', 'Z → A'], 'none'],
      ['artist', 'Artist, then title', ['A → Z', 'Z → A'], 'none']
    );
    if (caps.releaseDates) {
      list.push(['artistDate', 'Artist, then release date', ['oldest first', 'newest first'], 'release']);
      list.push(['date', 'Release date', ['oldest first', 'newest first'], 'release']);
    }
    if (caps.dateAdded) {
      list.push(['dateAdded', 'Date added', ['oldest first', 'newest first'], 'added']);
    }
    list.push(['album', 'Album', ['A → Z', 'Z → A'], 'none']);
    list.push(['duration', 'Duration', ['shortest first', 'longest first'], 'none']);
    return list;
  }
  /** Which track field the active date-based sort/stat should read. */
  const dateField = () => (dom.capabilities.releaseDates ? 'releaseDate' : dom.capabilities.dateAdded ? 'dateAdded' : null);

  const state = {
    open: false,
    page: 'other',
    playlistId: '',
    header: { title: '', subtitle: '' },
    tracks: [],
    loading: false,
    tab: 'tracks',
    filter: '',
    sortKey: 'index',
    sortDir: 1,
    hasCustomOrder: false, // whether the user has dragged a row this scan — gates the "Custom order" sort option
    selected: new Set(),
    progress: null,
    meta: { tags: [], note: '', color: null },
    allMeta: {},
    settings: { ...storage.DEFAULT_SETTINGS },
    libraryPlaylists: [],
    libraryTagFilter: '',
    batch: null, // { control } while a bulk action or date lookup runs
    scanControl: null, // { cancelled } for the in-flight scan(), if any — tripped by onPageChange on navigation
    scan: null, // { n, total, startedAt } live counters while state.loading is true, for the "Scanning" state
    dates: 'none', // 'none' | 'loading' | 'done'
    theme: { ...YTMO.theme.DEFAULTS }, // { layout, scheme, density, glow } — loaded/applied in init()
    keepRule: 'earliest', // rail/spine bulk-keep-rule selector: 'earliest' | 'longest' | 'official'
    matchMode: 'title', // duplicates match-mode control: 'title' | 'id' | 'fuzzy' (title+artist / video id / fuzzy)
  };

  let host, root, els;
  let dragKeys = null; // track keys mid-drag (own-panel reorder only — see onDragStart)

  // ---------- derived data ----------

  const primaryArtist = (t) => t.artists[0] || t.artist || '';
  const byText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  // Unknown dates always go last, whatever the direction.
  const byDate = (a, b, dir, field) => {
    const av = a[field],
      bv = b[field];
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  };

  function compareTracks(a, b) {
    const k = state.sortKey;
    // 'custom' has no comparison of its own — it means "keep state.tracks in whatever
    // order reorderTracks() last put it in." Array.prototype.sort is a stable sort (ES2019+),
    // so a comparator that always returns 0 preserves the array's current order exactly;
    // falling through to the usual `c || a.index - b.index` below would instead re-sort
    // everything back to original scrape order, silently destroying the drag arrangement.
    if (k === 'custom') return 0;
    const dir = state.sortDir;
    const df = dateField();
    let c = 0;
    switch (k) {
      case 'index':
        c = (a.index - b.index) * dir;
        break;
      case 'duration':
        c = (a.duration - b.duration) * dir;
        break;
      case 'title':
        c = byText(a.title, b.title) * dir;
        break;
      case 'titleArtist':
        c = byText(a.title, b.title) * dir || byText(primaryArtist(a), primaryArtist(b));
        break;
      case 'album':
        c = byText(a.album, b.album) * dir || byText(a.title, b.title);
        break;
      case 'artist':
        c = byText(primaryArtist(a), primaryArtist(b)) * dir || byText(a.title, b.title);
        break;
      case 'artistDate':
        c = byText(primaryArtist(a), primaryArtist(b)) || byDate(a, b, dir, df) || byText(a.title, b.title);
        break;
      case 'date':
      case 'dateAdded':
        c = byDate(a, b, dir, df) || byText(primaryArtist(a), primaryArtist(b)) || byText(a.title, b.title);
        break;
    }
    return c || a.index - b.index;
  }

  function visibleTracks() {
    const q = state.filter.trim().toLowerCase();
    let list = state.tracks;
    if (q) {
      list = list.filter((t) => [t.title, t.artist, t.album, t.releaseDate, t.dateAddedText].some((s) => (s || '').toLowerCase().includes(q)));
    }
    return [...list].sort(compareTracks);
  }

  /**
   * Duplicate groups.
   *  - exact:   same video ID (always).
   *  - fuzzy:   same title + same artists. With dupeVersions, remix/live/remaster
   *             markers are ignored; with dupeCollabs, tracks match when their
   *             artist lists overlap (e.g. "A" vs "A, B").
   * Each group is ordered so the copy worth keeping comes first, according to
   * state.keepRule: 'earliest' in the playlist (default), 'longest' duration,
   * or 'official' (plain title / fewest artists, i.e. not a version/collab).
   */
  function duplicateGroups() {
    const opts = { versions: !!state.settings.dupeVersions };
    const collabs = !!state.settings.dupeCollabs;
    const groups = [];

    const byId = new Map();
    for (const t of state.tracks) {
      if (!t.videoId) continue;
      if (!byId.has(t.videoId)) byId.set(t.videoId, []);
      byId.get(t.videoId).push(t);
    }
    for (const [id, list] of byId) {
      if (list.length > 1) groups.push({ type: 'exact', key: 'id:' + id, label: list[0].title, tracks: list });
    }

    const byTitle = new Map();
    for (const t of state.tracks) {
      const tk = titleKey(t.title, opts);
      if (!tk) continue;
      if (!byTitle.has(tk)) byTitle.set(tk, []);
      byTitle.get(tk).push(t);
    }
    for (const [tk, list] of byTitle) {
      if (list.length < 2) continue;
      // cluster by artists: exact artist set, or overlapping sets when collabs is on
      const clusters = [];
      for (const t of list) {
        const keys = new Set(t.artists.map(normalizeKey).filter(Boolean));
        const ak = artistKey(t.artists);
        let target = clusters.find((c) => (collabs ? [...keys].some((k) => c.keys.has(k)) : c.ak === ak));
        if (!target) {
          target = { ak, keys: new Set(), tracks: [] };
          clusters.push(target);
        }
        keys.forEach((k) => target.keys.add(k));
        target.tracks.push(t);
      }
      for (const c of clusters) {
        if (c.tracks.length < 2 || new Set(c.tracks.map((t) => t.videoId)).size < 2) continue;
        const tags = [];
        if (new Set(c.tracks.map((t) => titleKey(t.title))).size > 1) tags.push('version');
        if (new Set(c.tracks.map((t) => artistKey(t.artists))).size > 1) tags.push('collab');
        groups.push({ type: tags.length ? tags.join('+') : 'same', tags, key: 'fz:' + tk + ':' + c.ak, label: c.tracks[0].title, tracks: c.tracks });
      }
    }
    for (const g of groups) sortGroupByKeepRule(g.tracks);
    return groups;
  }

  /** Orders a duplicate group in place so index 0 is the suggested keeper, per state.keepRule. */
  function sortGroupByKeepRule(tracks) {
    const rule = state.keepRule;
    tracks.sort((a, b) => {
      if (rule === 'longest') return b.duration - a.duration || a.index - b.index;
      if (rule === 'official') return hasVersionMarker(a.title) - hasVersionMarker(b.title) || a.artists.length - b.artists.length || a.index - b.index;
      return a.index - b.index; // 'earliest'
    });
  }

  function stats() {
    const total = state.tracks.reduce((s, t) => s + t.duration, 0);
    const artists = new Map();
    const albums = new Map();
    const df = dateField();
    const dated = df ? state.tracks.filter((t) => t[df]).sort((a, b) => byDate(a, b, 1, df)) : [];
    for (const t of state.tracks) {
      for (const a of t.artists.length ? t.artists : [t.artist]) if (a) artists.set(a, (artists.get(a) || 0) + 1);
      if (t.album) albums.set(t.album, (albums.get(t.album) || 0) + 1);
    }
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      count: state.tracks.length,
      total,
      avg: state.tracks.length ? total / state.tracks.length : 0,
      unavailable: state.tracks.filter((t) => t.unavailable).length,
      dupes: duplicateGroups().reduce((s, g) => s + g.tracks.length - 1, 0),
      artists: artists.size,
      topArtists: top(artists),
      topAlbums: top(albums),
      oldest: dated[0] || null,
      newest: dated[dated.length - 1] || null,
      dated: dated.length,
      dateFieldLabel: df === 'releaseDate' ? 'release' : df === 'dateAdded' ? 'added' : null,
    };
  }

  function selectedTracks() {
    // Keep current sort order so "add to playlist" preserves it.
    const vis = visibleTracks();
    return vis.filter((t) => state.selected.has(t.key)).concat(state.tracks.filter((t) => state.selected.has(t.key) && !vis.includes(t)));
  }

  const sortDef = () => getSorts().find((s) => s[0] === state.sortKey) || getSorts()[0];
  /** Human-readable date to show for a track: the release date, or a (relative-friendly) added date. */
  const dateDisplay = (t) => (dom.capabilities.releaseDates ? t.releaseDate : dom.capabilities.dateAdded ? t.dateAddedText || t.dateAdded : '');
  const dateColumnLabel = () => (dom.capabilities.releaseDates ? 'Released' : dom.capabilities.dateAdded ? 'Added' : '');

  // ---------- rendering ----------

  /** Everything a layout module needs — state, derived data, formatting, and actions. Rebuilt fresh each render() call so it's always current. */
  function buildCtx() {
    return {
      YTMO,
      state,
      dom,
      auto,
      meta,
      storage,
      h,
      setHTML,
      icons: YTMO.icons.svg,
      formatDuration,
      formatTotal,
      visibleTracks,
      duplicateGroups,
      stats,
      selectedTracks,
      sortDef,
      getSorts,
      dateDisplay,
      dateColumnLabel,
      dateField,
      scan,
      fetchDates,
      removeSelected,
      addSelected,
      canApplyOrder,
      applySortToPlaylist,
      exportTracks,
      copyVisible,
      refreshLibrary,
      setSort,
      setDupeOption,
      setKeepRule,
      setMatchMode,
      setOpen,
      addTag,
      removeTag,
      setColor,
    };
  }

  function activeLayoutModule() {
    const id = state.theme.layout;
    return (YTMO.layouts && YTMO.layouts[id]) || YTMO.layouts.classic;
  }

  function render() {
    const tabs = YTMO.layoutShared.tabList(buildCtx());
    if (!tabs.some((t) => t[0] === state.tab)) state.tab = tabs[0][0];
    const scrollEl = els.shell.querySelector('.lo-scroll');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    activeLayoutModule().render(buildCtx(), els);
    const scrollEl2 = els.shell.querySelector('.lo-scroll');
    if (scrollEl2) scrollEl2.scrollTop = scrollTop;
  }

  function setProgress(text, pct, kind) {
    state.progress = text ? { text, pct, kind } : null;
    render();
  }

  // ---------- actions ----------

  /**
   * `state.scan` is the live counters the "Scanning" state (every layout) reads:
   * N of M read, duplicates found so far, skipped/unavailable, and an ETA
   * extrapolated from elapsed time × remaining fraction. Kept separate from
   * `state.tracks` isn't possible — showing a live duplicate count means
   * `state.tracks` itself has to hold the partial scrape as it grows, which is
   * safe here because nothing else reads `state.tracks` while `state.loading`
   * is true (the Tracks-tab table view only renders once loading finishes).
   */
  async function scan({ visibleOnly = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    state.selected.clear();
    state.dates = 'none';
    // A rescan re-reads the real playlist order from scratch, so any in-progress drag
    // arrangement is stale — fall back to it rather than silently keeping a "custom" sort
    // selected that no longer corresponds to anything the user actually arranged.
    if (state.sortKey === 'custom') state.sortKey = 'index';
    state.hasCustomOrder = false;
    state.scan = { n: 0, total: 0, startedAt: Date.now() };
    // Owned by this call only; onPageChange() trips it if the visitor navigates away mid-scan.
    const control = { cancelled: false };
    state.scanControl = control;
    render();
    const onTick = (n, total) => {
      state.scan.n = n;
      state.scan.total = total;
      state.tracks = dom.scrapeTracks();
      render();
    };
    try {
      if (visibleOnly) {
        onTick(dom.getRows().length, dom.getExpectedTotal ? dom.getExpectedTotal() : 0);
      } else {
        await dom.loadAllRows(onTick, { control });
      }
      if (!control.cancelled) {
        state.tracks = dom.scrapeTracks();
        if (dom.hydrateSetVideoIds) await dom.hydrateSetVideoIds(state.tracks);
        state.header = dom.getPlaylistHeader();
        if (dom.capabilities.releaseDates) {
          const missing = await meta.applyCachedDates(state.tracks);
          if (state.tracks.length && !missing) state.dates = 'done';
        }
        const key = metaKey();
        if (state.playlistId && state.header.title && state.allMeta[key] && state.allMeta[key].title !== state.header.title) {
          await storage.saveMeta(key, { title: state.header.title });
        }
        const total = dom.getExpectedTotal ? dom.getExpectedTotal() : 0;
        const complete = visibleOnly || !total || state.tracks.length >= total;
        setProgress(
          visibleOnly
            ? `Scanned ${state.tracks.length} visible tracks${total ? ` of ${total}` : ''} — Rescan for the rest`
            : complete
            ? `Scanned ${state.tracks.length} tracks`
            : `Loaded ${state.tracks.length} of ${total} tracks — scroll down to load the rest`,
          1,
          complete ? 'ok' : null
        );
        if (complete) setTimeout(() => state.progress?.kind === 'ok' && setProgress(null), 2500);
      }
    } catch (e) {
      if (!control.cancelled) setProgress('Scan failed: ' + e.message, null, 'err');
    }
    if (state.scanControl === control) state.scanControl = null;
    state.loading = false;
    state.scan = null;
    if (control.cancelled) {
      // The page has already moved on (onPageChange reset tracks/header/etc for the new
      // playlist) — just clear the stale progress bar and re-enable the Scan button.
      setProgress(null);
    } else {
      render();
    }
  }

  /**
   * For adapters that can't be driven to auto-load everything (Spotify), keep
   * pulling from the adapter's passive collector while the Tracks tab is open,
   * so the list visibly grows as the visitor scrolls through the real page.
   */
  function liveRefreshTick() {
    if (dom.capabilities.autoScroll) return;
    if (!state.open || state.tab !== 'tracks' || state.page !== 'playlist' || !state.tracks.length || state.loading || state.batch) return;
    const fresh = dom.scrapeTracks();
    if (fresh.length === state.tracks.length) return;
    const dates = new Map(state.tracks.map((t) => [t.key, t.releaseDate]));
    state.tracks = fresh;
    for (const t of state.tracks) t.releaseDate = dates.get(t.key) || t.releaseDate || '';
    render();
  }

  async function fetchDates() {
    if (!state.tracks.length || state.batch) return;
    state.dates = 'loading';
    state.batch = { control: { cancelled: false } };
    render();
    setProgress('Looking up release dates…', 0);
    let res;
    try {
      res = await meta.resolveReleaseDates(state.tracks, {
        control: state.batch.control,
        onProgress: (done, total) => setProgress(`Looking up release dates… ${done} / ${total}`, total ? done / total : 1),
      });
    } catch (e) {
      res = null;
      setProgress('Release date lookup failed: ' + e.message, null, 'err');
    }
    state.batch = null;
    state.dates = res && !res.cancelled ? 'done' : 'none';
    if (res) {
      const note = res.missing ? ` ${res.missing} without a date.` : '';
      setProgress(`${res.cancelled ? 'Stopped. ' : ''}Release dates: ${state.tracks.length - res.missing} of ${state.tracks.length} found.${note}`, 1, res.failed ? 'err' : 'ok');
    }
    render();
  }

  async function rescrapeInPlace() {
    const prevSel = state.selected;
    const dates = new Map(state.tracks.map((t) => [t.key, t.releaseDate]));
    state.tracks = dom.scrapeTracks();
    if (dom.hydrateSetVideoIds) await dom.hydrateSetVideoIds(state.tracks);
    for (const t of state.tracks) t.releaseDate = dates.get(t.key) || '';
    state.selected = new Set([...prevSel].filter((k) => state.tracks.some((t) => t.key === k)));
  }

  function modal(title, bodyHtml, confirmLabel, { danger = false } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      setHTML(
        bg,
        `<div class="modal"><h3>${h(title)}</h3><div>${bodyHtml}</div>
        <div class="actions"><button class="btn btn-secondary" data-m="cancel">Cancel</button><button class="btn ${danger ? '' : 'btn-primary'}" style="${danger ? 'color:#fff;background:#b0463c;border-color:#b0463c' : ''}" data-m="ok">${h(confirmLabel)}</button></div></div>`
      );
      els.wrap.appendChild(bg);
      bg.addEventListener('click', (e) => {
        const m = e.target.closest('[data-m]')?.dataset.m;
        if (m === 'ok') resolve(bg);
        else if (m === 'cancel' || e.target === bg) resolve(null);
        if (m || e.target === bg) bg.remove();
      });
      bg.querySelector('select, input')?.focus();
    });
  }

  async function removeSelected() {
    const tracks = selectedTracks();
    if (!tracks.length) return;
    const ok = await modal(
      `Remove ${tracks.length} track${tracks.length > 1 ? 's' : ''}?`,
      `<div class="muted">This clicks “Remove from playlist” in each track's menu, one by one. It only works on playlists you own. You can stop it at any time.</div>
       <ul class="lo-list" style="max-height:180px;overflow:auto;margin-top:8px">${tracks
         .slice(0, 50)
         .map((t) => `<li><span>#${t.index + 1} ${h(t.title)}</span><span class="muted">${h(t.artist)}</span></li>`)
         .join('')}${tracks.length > 50 ? `<li><span>…and ${tracks.length - 50} more</span></li>` : ''}</ul>`,
      'Remove',
      { danger: true }
    );
    if (!ok) return;
    await runBatch(tracks, (t) => auto.removeTrack(t, state.settings), 'Removing');
    await rescrapeInPlace();
    render();
  }

  async function addSelected() {
    const tracks = selectedTracks();
    if (!tracks.length) return;
    setProgress('Reading your playlists from the save dialog…', null);
    let names = [];
    try {
      names = await auto.listTargetPlaylists(tracks[0], state.settings);
    } catch (e) {
      setProgress('Could not open the save dialog: ' + e.message, null, 'err');
      return;
    }
    setProgress(null);
    if (!names.length) {
      setProgress('No playlists found in the save dialog. Are you signed in?', null, 'err');
      return;
    }
    const bg = await modal(
      `Add ${tracks.length} track${tracks.length > 1 ? 's' : ''} to…`,
      `<select class="input">${names.map((n) => `<option>${h(n)}</option>`).join('')}</select>
       <div class="muted" style="margin-top:8px">Tracks are added in the order currently shown (sort the list first to build a sorted copy). Create the target playlist in ${h(
         dom.serviceName
       )} first if it doesn't exist.</div>`,
      'Add'
    );
    if (!bg) return;
    const target = bg.querySelector('select').value;
    await runBatch(tracks, (t) => auto.addTrackToPlaylist(t, target, state.settings), `Adding to “${target}”`);
  }

  /** Whether "Apply order" should be offered for the current sort/state. */
  function canApplyOrder() {
    return !!dom.capabilities.physicalReorder && state.sortKey !== 'index' && state.tracks.length > 1;
  }

  /**
   * Physically reorders the real playlist to match the panel's current sort — the panel's
   * own sort is otherwise just a view, same as every other sort mode (see README). Moves
   * are issued from the end of the target order backward, one per adjacent pair: this is
   * the minimum number of "move X before Y" calls (length-1) that's guaranteed to converge
   * to the right order regardless of the playlist's current order.
   */
  async function applySortToPlaylist() {
    if (!canApplyOrder()) return;
    const ordered = [...state.tracks].sort(compareTracks);
    const missing = ordered.filter((t) => !t.setVideoId).length;
    if (missing) {
      setProgress(`${missing} track${missing > 1 ? 's are' : ' is'} missing the id needed to move it — rescan the playlist and try again.`, null, 'err');
      return;
    }
    const moves = [];
    for (let i = ordered.length - 2; i >= 0; i--) moves.push({ setVideoId: ordered[i].setVideoId, before: ordered[i + 1].setVideoId });
    const ok = await modal(
      `Reorder ${ordered.length} tracks in the real playlist?`,
      `<div class="muted">This physically moves every track in ${h(dom.serviceName)} to match the current sort (“${h(
        sortDef()[1]
      )}”). It edits the playlist directly, the same way dragging a row would — there's no undo besides sorting again. You can stop it partway, but tracks already moved will stay moved.</div>`,
      'Reorder',
      { danger: true }
    );
    if (!ok) return;
    await runBatch(moves, (m) => auto.moveItemBefore(state.playlistId, m.setVideoId, m.before, state.settings), 'Reordering');
    await rescrapeInPlace();
    render();
  }

  async function runBatch(tracks, fn, verb) {
    state.batch = { control: { cancelled: false } };
    render();
    setProgress(`${verb} 0 / ${tracks.length}…`, 0);
    const res = await auto.runBatch(tracks, fn, {
      control: state.batch.control,
      onProgress: (i, n, t, r) => setProgress(`${verb} ${i} / ${n}… (${r.failed.length} failed)`, i / n),
    });
    state.batch = null;
    const msg =
      `${res.stoppedEarly ? 'Stopped. ' : 'Done. '}${res.ok.length} succeeded, ${res.failed.length} failed.` +
      (res.failed.length ? ' First error: ' + res.failed[0].error : '');
    setProgress(msg, 1, res.failed.length ? 'err' : 'ok');
    for (const t of res.ok) state.selected.delete(t.key);
    render();
  }

  function exportTracks(fmt) {
    const list = visibleTracks();
    const name = safeFilename(state.header.title || state.playlistId);
    const idLabel = dom.trackIdLabel;
    if (fmt === 'csv') {
      const csv = toCSV(
        list.map((t) => ({ ...t, position: t.index + 1, dateDisplay: dateDisplay(t) })),
        [
          { key: 'position', label: 'Position' },
          { key: 'title', label: 'Title' },
          { key: 'artist', label: 'Artist' },
          { key: 'album', label: 'Album' },
          { key: 'dateDisplay', label: dateColumnLabel() || 'Date' },
          { key: 'durationText', label: 'Duration' },
          { key: 'videoId', label: idLabel },
          { key: 'url', label: 'URL' },
        ]
      );
      download(`${name}.csv`, csv, 'text/csv');
    } else {
      const data = {
        service: YTMO.site.name,
        playlistId: state.playlistId,
        title: state.header.title,
        exportedAt: new Date().toISOString(),
        tags: state.meta.tags,
        note: state.meta.note,
        tracks: list.map((t) => ({
          position: t.index + 1,
          title: t.title,
          artist: t.artist,
          artists: t.artists,
          album: t.album,
          releaseDate: t.releaseDate,
          dateAdded: t.dateAdded,
          duration: t.duration,
          trackId: t.videoId,
          url: t.url,
        })),
      };
      download(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
    }
  }

  async function copyVisible() {
    const text = visibleTracks()
      .map((t) => `${t.title} — ${t.artist}${t.album ? ` (${t.album})` : ''}${dateDisplay(t) ? ` [${dateDisplay(t)}]` : ''}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setProgress('Copied to clipboard', null, 'ok');
    } catch (e) {
      setProgress('Clipboard blocked: ' + e.message, null, 'err');
    }
  }

  const saveNote = debounce(async (note) => {
    state.meta = await storage.saveMeta(metaKey(), { note, title: state.header.title });
    state.allMeta = await storage.getAllMeta();
  }, 400);

  async function addTag(tag) {
    tag = tag.trim().replace(/^#/, '');
    if (!tag || state.meta.tags.includes(tag)) return;
    state.meta = await storage.saveMeta(metaKey(), { tags: [...state.meta.tags, tag], title: state.header.title });
    state.allMeta = await storage.getAllMeta();
    render();
    els.wrap.querySelector('[data-in=newtag]')?.focus();
  }

  async function removeTag(tag) {
    state.meta = await storage.saveMeta(metaKey(), { tags: state.meta.tags.filter((t) => t !== tag) });
    state.allMeta = await storage.getAllMeta();
    render();
  }

  async function setColor(color) {
    state.meta = await storage.saveMeta(metaKey(), { color: color || null, title: state.header.title });
    state.allMeta = await storage.getAllMeta();
    render();
  }

  async function setDupeOption(key, value) {
    state.settings = { ...state.settings, [key]: value };
    render();
    await storage.saveSettings({ [key]: value });
  }

  function setKeepRule(rule) {
    state.keepRule = rule;
    render();
  }

  async function setMatchMode(mode) {
    state.matchMode = mode;
    // "Fuzzy" is the mode that's supposed to catch remix/version and feat./collab
    // variants, so make sure the underlying matcher is actually looking for them;
    // other modes fall back to the plain exact/same-song match.
    const wantBroad = mode === 'fuzzy';
    if (!!state.settings.dupeVersions !== wantBroad || !!state.settings.dupeCollabs !== wantBroad) {
      state.settings = { ...state.settings, dupeVersions: wantBroad, dupeCollabs: wantBroad };
      await storage.saveSettings({ dupeVersions: wantBroad, dupeCollabs: wantBroad });
    }
    render();
  }

  function setSort(key, dir) {
    state.sortKey = key;
    state.sortDir = dir;
    render();
    if (sortDef()[3] === 'release' && dom.capabilities.releaseDates && state.dates === 'none' && state.tracks.some((t) => !t.releaseDate)) fetchDates();
  }

  /**
   * Moves `draggedKeys` (in their current visual order) to just before/after `targetKey`,
   * then switches to the 'custom' sort so the result sticks instead of being immediately
   * re-sorted away. Declines while a filter is active — with tracks hidden, "current visual
   * order" isn't the same as "current full order," and there's no obviously-right way to
   * interleave hidden tracks back in, so this asks the user to clear the filter first
   * rather than silently doing something arguably-wrong with their playlist order.
   */
  function reorderTracks(draggedKeys, targetKey, after) {
    if (state.filter.trim()) return;
    const visible = visibleTracks();
    const draggedSet = new Set(draggedKeys);
    if (draggedSet.has(targetKey)) return;
    const dragged = visible.filter((t) => draggedSet.has(t.key));
    if (!dragged.length) return;
    const remaining = visible.filter((t) => !draggedSet.has(t.key));
    const targetIdx = remaining.findIndex((t) => t.key === targetKey);
    if (targetIdx === -1) return;
    remaining.splice(targetIdx + (after ? 1 : 0), 0, ...dragged);
    state.tracks = remaining;
    state.sortKey = 'custom';
    state.hasCustomOrder = true;
    render();
  }

  function refreshLibrary() {
    state.libraryPlaylists = dom.getLibraryPlaylists();
    render();
  }

  // ---------- theme ----------

  async function applyThemePatch(patch) {
    const next = YTMO.theme.Theme.apply(els.wrap, { ...state.theme, ...patch });
    state.theme = next;
    render();
    await YTMO.theme.Theme.save(next);
  }

  async function resetTheme() {
    const next = await YTMO.theme.Theme.reset();
    YTMO.theme.Theme.apply(els.wrap, next);
    state.theme = next;
    render();
  }

  // ---------- events ----------

  function onClick(e) {
    const pick = e.target.closest('[data-pick][data-value]');
    if (pick) return applyThemePatch({ [pick.dataset.pick]: pick.dataset.value });

    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    if (act) {
      switch (act) {
        case 'close':
          return setOpen(false);
        case 'scan':
          return scan();
        case 'dates':
          return fetchDates();
        case 'sortdir':
          return setSort(state.sortKey, state.sortDir * -1);
        case 'select-dupes':
          for (const g of duplicateGroups()) g.tracks.slice(1).forEach((t) => state.selected.add(t.key));
          return render();
        case 'clear-sel':
          state.selected.clear();
          return render();
        case 'sel-visible': {
          const list = visibleTracks();
          const all = list.every((t) => state.selected.has(t.key));
          list.forEach((t) => (all ? state.selected.delete(t.key) : state.selected.add(t.key)));
          return render();
        }
        case 'export-csv':
          return exportTracks('csv');
        case 'export-json':
          return exportTracks('json');
        case 'copy':
          return copyVisible();
        case 'add-sel':
          return addSelected();
        case 'remove-sel':
          return removeSelected();
        case 'apply-order':
          return applySortToPlaylist();
        case 'cancel':
          if (state.batch) state.batch.control.cancelled = true;
          return setProgress('Stopping…', state.progress?.pct);
        case 'cancel-scan':
          if (state.scanControl) state.scanControl.cancelled = true;
          return;
        case 'dismiss':
          return setProgress(null);
        case 'refresh-lib':
          return refreshLibrary();
        case 'theme-save':
          return applyThemePatch({});
        case 'theme-reset':
          return resetTheme();
      }
      // Layout-specific actions not handled above (e.g. a merge-stack expand toggle)
      // are dispatched to the active layout module, if it wants them.
      if (typeof activeLayoutModule().onAction === 'function') {
        if (activeLayoutModule().onAction(act, actEl, buildCtx())) return render();
      }
    }
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (tab) {
      state.tab = tab;
      if (tab === 'library') refreshLibrary();
      return render();
    }
    const chk = e.target.closest('[data-chk]');
    if (chk) {
      if (chk.checked) state.selected.add(chk.dataset.chk);
      else state.selected.delete(chk.dataset.chk);
      return render();
    }
    const opt = e.target.closest('[data-opt]');
    if (opt) return setDupeOption(opt.dataset.opt, opt.checked);
    const sortTh = e.target.closest('[data-sort]');
    if (sortTh) {
      const k = sortTh.dataset.sort;
      return setSort(k, state.sortKey === k ? state.sortDir * -1 : 1);
    }
    const rm = e.target.closest('[data-rmtag]');
    if (rm) return removeTag(rm.dataset.rmtag);
    const col = e.target.closest('[data-color]');
    if (col) return setColor(col.dataset.color);
    const row = e.target.closest('[data-key]');
    if (row) {
      const t = state.tracks.find((x) => x.key === row.dataset.key);
      if (t && !dom.scrollToRow(t)) setProgress('Row not found on page any more. Rescan.', null, 'err');
    }
  }

  // ---------- drag-and-drop reordering (within this panel only — see reorderTracks) ----------

  function clearDropMarkers() {
    els.wrap.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
  }

  function onDragStart(e) {
    const row = e.target.closest('[draggable="true"][data-key]');
    if (!row) return;
    const key = row.dataset.key;
    // Dragging a row that's part of the current checked selection carries the whole
    // selection along, in their current visual order; dragging an unchecked row only
    // moves that one row, regardless of what else happens to be checked.
    dragKeys = state.selected.has(key) && state.selected.size > 1 ? visibleTracks().filter((t) => state.selected.has(t.key)).map((t) => t.key) : [key];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key); // required by some browsers for drop to fire at all
    row.classList.add('dragging');
  }

  function onDragOver(e) {
    if (!dragKeys) return;
    const row = e.target.closest('[data-key]');
    if (!row) return;
    e.preventDefault(); // required to allow a drop
    const after = e.clientY - row.getBoundingClientRect().top > row.getBoundingClientRect().height / 2;
    if (row.classList.contains(after ? 'drop-after' : 'drop-before')) return; // already marked, skip the churn
    clearDropMarkers();
    row.classList.add(after ? 'drop-after' : 'drop-before');
  }

  function onDrop(e) {
    if (!dragKeys) return;
    e.preventDefault();
    const row = e.target.closest('[data-key]');
    const keys = dragKeys;
    dragKeys = null;
    clearDropMarkers();
    if (!row) return;
    const after = e.clientY - row.getBoundingClientRect().top > row.getBoundingClientRect().height / 2;
    reorderTracks(keys, row.dataset.key, after);
  }

  function onDragEnd() {
    dragKeys = null;
    clearDropMarkers();
  }

  function onInput(e) {
    const k = e.target.dataset.in;
    if (k === 'filter') {
      state.filter = e.target.value;
      render();
    } else if (k === 'sort') {
      setSort(e.target.value, 1);
    } else if (k === 'note') {
      saveNote(e.target.value);
    } else if (k === 'tagfilter') {
      state.libraryTagFilter = e.target.value;
      render();
    }
  }

  function onKeydown(e) {
    if (e.target.dataset.in === 'newtag' && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = e.target.value;
      e.target.value = '';
      addTag(v);
    }
    if (e.key === 'Escape' && state.open && !els.wrap.querySelector('.modal-bg')) setOpen(false);
    e.stopPropagation(); // keep the host site's keyboard shortcuts (space = play) from firing while typing
  }

  // ---------- lifecycle ----------

  function setOpen(open) {
    state.open = open;
    els.wrap.classList.toggle('open', open);
    if (open) render();
  }

  function layout() {
    const { top, bottom } = dom.getLayoutInsets();
    els.wrap.style.setProperty('--inset-top', top + 'px');
    els.wrap.style.setProperty('--inset-bottom', bottom + 'px');
  }

  async function onPageChange() {
    const page = dom.getPageType();
    const id = dom.getPlaylistId();
    const changed = page !== state.page || id !== state.playlistId;
    state.page = page;
    state.playlistId = id;
    if (changed) {
      // Failsafe: stop any scan or bulk remove/add/date-lookup still running against the
      // playlist the visitor just left, rather than let it keep acting on the new page.
      if (state.scanControl) state.scanControl.cancelled = true;
      if (state.batch) state.batch.control.cancelled = true;
      state.tracks = [];
      state.selected.clear();
      state.filter = '';
      state.sortKey = 'index';
      state.sortDir = 1;
      state.progress = null;
      state.dates = 'none';
      state.header = page === 'playlist' ? dom.getPlaylistHeader() : { title: '', subtitle: '' };
      state.meta = page === 'playlist' && id ? await storage.getMeta(YTMO.site.metaKey(id)) : { tags: [], note: '', color: null };
      state.tab = page === 'playlist' ? 'tracks' : 'library';
      // header title may render after navigation finishes
      if (page === 'playlist') setTimeout(() => ((state.header = dom.getPlaylistHeader()), render()), 1200);
      if (page === 'library') setTimeout(refreshLibrary, 1200);
    }
    state.allMeta = await storage.getAllMeta();
    els.wrap.classList.toggle('lo-hidden-chrome', page === 'other' && !Object.keys(state.allMeta).length);
    if (state.settings.autoOpen && page === 'playlist' && changed && !state.open) setOpen(true);
    render();
  }

  async function init() {
    if (document.getElementById('ytmo-host')) return;
    host = document.createElement('div');
    host.id = 'ytmo-host';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'open' });

    // cache: 'no-store' — chrome-extension:// URLs can otherwise still serve an HTTP-cached
    // response after the extension reloads with a changed file on disk, unlike content
    // scripts (always re-injected fresh); confirmed live, this was silently serving stale CSS.
    const [themeCss, panelCss] = await Promise.all([
      fetch(chrome.runtime.getURL('src/content/theme.css'), { cache: 'no-store' }).then((r) => r.text()),
      fetch(chrome.runtime.getURL('src/content/panel.css'), { cache: 'no-store' }).then((r) => r.text()),
    ]);
    setHTML(
      root,
      `<style>${themeCss}</style><style>${panelCss}</style>
      <div class="organizer-panel">
        <button class="lo-edgetab" data-act="toggle" title="Open Organizer" aria-label="Open Organizer">${YTMO.icons.svg('list-magnifying-glass')}</button>
        <div class="lo-shell"></div>
      </div>`
    );
    els = {
      wrap: root.querySelector('.organizer-panel'),
      edgeTab: root.querySelector('.lo-edgetab'),
      shell: root.querySelector('.lo-shell'),
    };
    els.edgeTab.addEventListener('click', () => setOpen(!state.open));
    els.wrap.addEventListener('click', onClick);
    els.wrap.addEventListener('input', onInput);
    els.wrap.addEventListener('change', onInput);
    els.wrap.addEventListener('keydown', onKeydown);
    els.wrap.addEventListener('dragstart', onDragStart);
    els.wrap.addEventListener('dragover', onDragOver);
    els.wrap.addEventListener('drop', onDrop);
    els.wrap.addEventListener('dragend', onDragEnd);

    state.settings = await storage.getSettings();
    state.theme = await YTMO.theme.initTheme(els.wrap);
    YTMO.theme.Theme.subscribe((next) => {
      state.theme = YTMO.theme.Theme.apply(els.wrap, next);
      render();
    });
    storage.onChange(async (changes) => {
      if (changes.settings) state.settings = await storage.getSettings();
      if (changes.playlistMeta) {
        state.allMeta = await storage.getAllMeta();
        if (state.playlistId) state.meta = await storage.getMeta(metaKey());
        if (state.open && state.tab === 'library') render();
      }
    });

    layout();
    setInterval(layout, 2000);
    setInterval(liveRefreshTick, 1500);
    window.addEventListener('resize', layout);
    await onPageChange();
    dom.onNavigate(onPageChange);
  }

  YTMO.panel = { init, state, setOpen, refreshLibrary, duplicateGroups, visibleTracks };
})();
