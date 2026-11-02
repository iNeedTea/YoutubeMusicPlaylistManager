/* global window */
// Content builders for the tabs that don't have a bespoke per-layout treatment
// in layouts.md (Stats, Tags & notes, Tagged, and the Theme tab) — every
// layout wraps these in its own chrome, but the inner content is one
// implementation. Bespoke tracks/duplicates views live in each layout-*.js.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  function statsBody(ctx) {
    const { h, state, stats, formatTotal, formatDuration, dateDisplay } = ctx;
    if (!state.tracks.length) return `<div class="empty muted">Scan the playlist first (Tracks tab).</div>`;
    const s = stats();
    const li = (arr) => arr.map(([k, v]) => `<li><span>${h(k)}</span><span class="num">${v}</span></li>`).join('');
    const span = (t) => (t ? `${h(dateDisplay(t))}<div class="muted-2" style="font-size:11px;font-weight:400">${h(t.title)}</div>` : '—');
    return `<div class="lo-section">
        <div class="lo-stat-grid">
          <div class="lo-card"><div class="lo-v">${s.count}</div><div class="muted lo-l">tracks</div></div>
          <div class="lo-card"><div class="lo-v">${h(formatTotal(s.total))}</div><div class="muted lo-l">total length</div></div>
          <div class="lo-card"><div class="lo-v">${h(formatDuration(s.avg))}</div><div class="muted lo-l">average track</div></div>
          <div class="lo-card"><div class="lo-v">${s.artists}</div><div class="muted lo-l">distinct artists</div></div>
          <div class="lo-card"><div class="lo-v">${s.dupes}</div><div class="muted lo-l">duplicate copies</div></div>
          <div class="lo-card"><div class="lo-v">${s.unavailable}</div><div class="muted lo-l">unavailable</div></div>
          ${
            s.dated
              ? `<div class="lo-card"><div class="lo-v" style="font-size:15px">${span(s.oldest)}</div><div class="muted lo-l">oldest ${h(s.dateFieldLabel)}</div></div>
                 <div class="lo-card"><div class="lo-v" style="font-size:15px">${span(s.newest)}</div><div class="muted lo-l">newest ${h(s.dateFieldLabel)}</div></div>`
              : ''
          }
        </div></div>
      <div class="lo-section"><b>Top artists</b><ul class="lo-list">${li(s.topArtists) || '<li><span class="muted">—</span></li>'}</ul></div>
      <div class="lo-section"><b>Top albums</b><ul class="lo-list">${li(s.topAlbums) || '<li><span class="muted">—</span></li>'}</ul></div>`;
  }

  function notesBody(ctx) {
    const { h, state, storage } = ctx;
    return `<div class="lo-section">
      <b>Colour</b>
      <div class="lo-colors">${storage.AVAILABLE_COLORS.map((c) => `<span style="background:${c}" class="${state.meta.color === c ? 'on' : ''}" data-color="${c}"></span>`).join('')}<span class="lo-color-none ${!state.meta.color ? 'on' : ''}" data-color="" title="none"></span></div>
      <b>Tags</b>
      <div>${state.meta.tags.map((t) => `<span class="tag">${h(t)}<span class="lo-x" data-rmtag="${h(t)}">${YTMO.icons.svg('x')}</span></span>`).join('') || '<span class="muted">No tags yet.</span>'}</div>
      <input type="text" class="input" placeholder="Add tag and press Enter (e.g. workout, chill, 2024)" data-in="newtag" style="margin-top:var(--space-3)">
      <div style="margin-top:var(--space-6)"><b>Notes</b></div>
      <textarea class="input lo-textarea" data-in="note" placeholder="What is this playlist for? Anything to remember…">${h(state.meta.note)}</textarea>
      <div class="muted lo-hint">Saved locally in this browser and shown on the Tagged tab.</div>
    </div>`;
  }

  function taggedBody(ctx) {
    const { h, state, dom } = ctx;
    let items =
      state.page === 'library' && dom.capabilities.libraryPage
        ? state.libraryPlaylists.map((p) => ({ metaKey: p.id, id: p.id, service: 'ytm', title: p.title, subtitle: p.subtitle }))
        : Object.entries(state.allMeta).map(([key, m]) => {
            const isSpotify = key.startsWith('spotify:');
            return { metaKey: key, id: isSpotify ? key.slice('spotify:'.length) : key, service: isSpotify ? 'spotify' : 'ytm', title: m.title || key, subtitle: '' };
          });
    const SITE_URL = { ytm: (id) => `https://music.youtube.com/playlist?list=${encodeURIComponent(id)}`, spotify: (id) => `https://open.spotify.com/playlist/${encodeURIComponent(id)}` };
    const SITE_LABEL = { ytm: 'YTM', spotify: 'Spotify' };
    const withMeta = items.map((p) => ({ ...p, meta: state.allMeta[p.metaKey] || { tags: [], note: '', color: null } }));
    const filtered = state.libraryTagFilter ? withMeta.filter((p) => p.meta.tags?.includes(state.libraryTagFilter)) : withMeta;
    if (!filtered.length)
      return `<div class="empty muted">${
        state.page === 'library' && dom.capabilities.libraryPage
          ? 'No playlists found on this page yet. Scroll the page, then refresh.'
          : 'No tagged playlists yet. Open a playlist and add tags on the “Tags & notes” tab.'
      }</div>`;
    return `<div class="lo-taglist">${filtered
      .map(
        (p) => `<div class="lo-tagrow" data-lib="${h(p.metaKey)}">
        <span class="lo-dot" style="${p.meta.color ? 'background:' + h(p.meta.color) : ''}"></span>
        <div class="lo-tagrow-meta"><a href="${SITE_URL[p.service](p.id)}" target="_blank" rel="noopener">${h(p.title)}</a>
          <small class="muted">${h(SITE_LABEL[p.service])}${p.subtitle ? ' · ' + h(p.subtitle) : ''}${p.meta.note ? ' · ' + h(p.meta.note.slice(0, 80)) : ''}</small>
          <div>${(p.meta.tags || []).map((t) => `<span class="tag">${h(t)}</span>`).join('')}</div></div>
      </div>`
      )
      .join('')}</div>`;
  }

  /** Bar (toolbar) content for the Tagged tab — same across layouts. */
  function taggedBar(ctx) {
    const { h, state } = ctx;
    const tags = new Set();
    for (const m of Object.values(state.allMeta)) for (const t of m.tags || []) tags.add(t);
    return `<select class="input" data-in="tagfilter" style="max-width:180px"><option value="">All tags</option>${[...tags]
      .sort()
      .map((t) => `<option ${state.libraryTagFilter === t ? 'selected' : ''}>${h(t)}</option>`)
      .join('')}</select>
    <button class="btn btn-icon btn-secondary" data-act="refresh-lib" title="Refresh">${YTMO.icons.svg('arrows-clockwise')}</button>
    <span class="muted" style="font-size:12px">${state.page === 'library' ? 'Playlists on this page' : 'Playlists you have tagged'}</span>`;
  }

  // ---------- Theme tab ----------

  function themeBody(ctx) {
    const { h, state } = ctx;
    const t = state.theme;
    const T = YTMO.theme;
    const layoutWireframe = (id) => {
      // Tiny abstract wireframes, purely decorative, no colour literals (currentColor + fill-opacity only).
      const bars = {
        classic: '<rect x="2" y="2" width="30" height="5" rx="1"/><rect x="2" y="9" width="30" height="3" rx="1" opacity=".5"/><rect x="2" y="14" width="30" height="4" rx="1" opacity=".35"/><rect x="2" y="20" width="30" height="4" rx="1" opacity=".35"/>',
        rail: '<rect x="2" y="2" width="6" height="22" rx="1" opacity=".5"/><rect x="11" y="2" width="21" height="4" rx="1"/><rect x="11" y="9" width="21" height="3" rx="1" opacity=".35"/><rect x="11" y="15" width="21" height="3" rx="1" opacity=".35"/>',
        console: '<rect x="2" y="2" width="30" height="3" rx="1"/><rect x="2" y="8" width="14" height="2.5" opacity=".5"/><rect x="2" y="13" width="20" height="2.5" opacity=".35"/><rect x="2" y="18" width="10" height="2.5" opacity=".35"/><rect x="2" y="22.5" width="6" height="1.5" opacity=".8"/>',
        spine: '<circle cx="7" cy="4" r="2"/><path d="M7 6v18" stroke="currentColor" stroke-width="1.4" fill="none" opacity=".5"/><circle cx="7" cy="12" r="1.6" opacity=".7"/><circle cx="7" cy="20" r="1.6" opacity=".4"/><rect x="13" y="9" width="19" height="6" rx="1.5" opacity=".5"/><rect x="13" y="17" width="19" height="6" rx="1.5" opacity=".35"/>',
      }[id];
      return `<svg width="100%" height="34" viewBox="0 0 34 26" fill="currentColor"><g>${bars}</g></svg>`;
    };
    const layoutCards = T.LAYOUTS.map(
      (l) => `<button class="lo-theme-card ${t.layout === l.id ? 'on' : ''}" data-pick="layout" data-value="${l.id}">
        <div class="lo-theme-wire muted-2">${layoutWireframe(l.id)}</div>
        <div class="lo-theme-name">${h(l.name)}</div>
        <div class="muted lo-theme-note">${h(l.note)}</div>
      </button>`
    ).join('');
    const schemeCards = T.SCHEMES.map(
      (s) => `<button class="lo-theme-card lo-scheme-card ${t.scheme === s.id ? 'on' : ''}" data-pick="scheme" data-value="${s.id}">
        <div class="lo-swatches">
          <span style="background:${s.bg}"></span><span style="background:${s.surface}"></span><span style="background:${s.accent}"></span>
        </div>
        <div class="lo-theme-name">${h(s.name)}</div>
        <div class="muted lo-theme-note">${h(s.sub)}</div>
      </button>`
    ).join('');
    const seg = (pick, options, current) =>
      `<div class="lo-segmented">${options
        .map(([v, l]) => `<button class="${current === v ? 'on' : ''}" data-pick="${pick}" data-value="${v}">${h(l)}</button>`)
        .join('')}</div>`;
    return `<div class="lo-section">
      <div class="lo-theme-label">Layout</div>
      <div class="lo-theme-grid">${layoutCards}</div>
    </div>
    <div class="lo-section">
      <div class="lo-theme-label">Colour scheme</div>
      <div class="lo-theme-grid lo-theme-grid-5">${schemeCards}</div>
    </div>
    <div class="lo-section lo-theme-row">
      <div><div class="lo-theme-label">Row density</div>${seg('density', [['compact', 'Compact'], ['thumbs', 'Thumbnails'], ['roomy', 'Roomy']], t.density)}</div>
      <div><div class="lo-theme-label">Accent glow</div>${seg('glow', [['on', 'On'], ['off', 'Off']], t.glow)}</div>
    </div>
    <div class="lo-theme-footer muted">
      <span>${h(T.LAYOUTS.find((l) => l.id === t.layout)?.name)} · ${h(T.SCHEMES.find((s) => s.id === t.scheme)?.name)} · saved</span>
      <span class="lo-spacer"></span>
      <button class="btn btn-secondary" data-act="theme-reset">Reset</button>
      <button class="btn btn-primary" data-act="theme-save">Save theme</button>
    </div>`;
  }

  /** Header button that flips the panel between its side-panel size and covering the whole window — same in every layout. */
  function fullscreenButton(ctx) {
    const on = ctx.state.full;
    return `<button class="btn btn-icon btn-secondary" data-act="toggle-full" title="${on ? 'Back to side panel (Esc)' : 'Fill the whole window'}" aria-label="${on ? 'Exit full window' : 'Fill the whole window'}">${ctx.icons(on ? 'arrows-in' : 'arrows-out')}</button>`;
  }

  /** [key, label, count][] for whichever tabs apply to the current page — shared across layouts. */
  function tabList(ctx) {
    const { state, duplicateGroups } = ctx;
    const dupes = state.tracks.length ? duplicateGroups().length : 0;
    const libLabel = state.page === 'library' ? 'Playlists' : 'Tagged';
    const tabs =
      state.page === 'playlist'
        ? [
            ['tracks', 'Tracks', state.tracks.length],
            ['dupes', 'Duplicates', dupes],
            ['stats', 'Stats', 0],
            ['notes', 'Tags & notes', state.meta.tags.length],
          ]
        : [['library', libLabel, 0]];
    if (state.page === 'playlist') tabs.push(['library', 'Tagged', 0]);
    if (ctx.dom.capabilities.catalogAdd) tabs.push(['discover', 'Add music', 0]);
    tabs.push(['theme', 'Theme', 0]);
    return tabs;
  }

  /**
   * The "States" spec (shared by every layout) calls for a match-mode control:
   * video id (exact only), title+artist (exact + same-song, no version/collab
   * fuzziness), or fuzzy (everything duplicateGroups() finds, including
   * version/collab matches — which this also switches the underlying
   * dupeVersions/dupeCollabs settings on for, so what's shown matches what's
   * actually being matched).
   */
  function visibleDupeGroups(ctx) {
    const groups = ctx.duplicateGroups();
    const mode = ctx.state.matchMode;
    if (mode === 'id') return groups.filter((g) => g.type === 'exact');
    if (mode === 'title') return groups.filter((g) => g.type === 'exact' || g.type === 'same');
    return groups; // 'fuzzy'
  }

  const MATCH_MODES = [
    ['title', 'Title + artist'],
    ['id', 'Video ID'],
    ['fuzzy', 'Fuzzy'],
  ];

  function scanEta(state) {
    const s = state.scan;
    if (!s || !s.total || !s.n || s.n >= s.total) return '';
    const elapsed = (Date.now() - s.startedAt) / 1000;
    const rate = s.n / elapsed; // tracks per second
    if (!rate) return '';
    const etaSec = Math.max(0, s.total - s.n) / rate;
    if (etaSec < 1.5) return 'almost done';
    if (etaSec < 60) return `~${Math.ceil(etaSec)}s left`;
    return `~${Math.ceil(etaSec / 60)}m left`;
  }

  /**
   * The "Scanning" state's shared summary line, used by every layout: N of M
   * read, duplicates found so far, skipped/unavailable, an ETA, and Cancel.
   * Each layout still supplies its own shimmer-skeleton rows below this to
   * match its row style.
   */
  function scanStatusBar(ctx) {
    const { h, state, icons } = ctx;
    const s = state.scan;
    if (!s) return '';
    const dupes = state.tracks.length ? ctx.duplicateGroups().reduce((sum, g) => sum + g.tracks.length - 1, 0) : 0;
    const unavailable = state.tracks.filter((t) => t.unavailable).length;
    const eta = scanEta(state);
    const pct = s.total ? Math.min(1, s.n / s.total) : null;
    return `<div class="lo-scanbar">
      <div class="lo-scanbar-row">
        <span>${s.total ? `${s.n} of ${s.total} read` : `${s.n} read`}</span>
        <span class="muted">${dupes} duplicate${dupes === 1 ? '' : 's'} found</span>
        <span class="muted">${unavailable} unavailable</span>
        ${eta ? `<span class="muted">${h(eta)}</span>` : ''}
        <span class="lo-spacer"></span>
        <button class="btn btn-secondary btn-icon" data-act="cancel-scan" title="Cancel scan" aria-label="Cancel scan">${icons('x')}</button>
      </div>
      <div class="lo-scanbar-track">${pct != null ? `<div style="width:${Math.round(pct * 100)}%"></div>` : `<div class="lo-scanbar-indeterminate"></div>`}</div>
    </div>`;
  }

  /** N skeleton rows with a shimmer sweep, appended below the already-read rows while scanning. */
  function skeletonRows(n) {
    n = Math.max(0, Math.min(6, n));
    return Array.from({ length: n }, () => `<div class="lo-skeleton-row"><span class="lo-skeleton"></span></div>`).join('');
  }

  YTMO.layoutShared = { fullscreenButton, statsBody, notesBody, taggedBody, taggedBar, themeBody, tabList, visibleDupeGroups, MATCH_MODES, scanEta, scanStatusBar, skeletonRows };
})();
