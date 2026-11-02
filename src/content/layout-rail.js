/* global window */
// Status rail layout — a 64px icon rail replaces the tab strip; the content
// column drops straight into a simplified header + bulk-rule chip row.
// Duplicates render as side-by-side compare cards instead of a list.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const LS = () => YTMO.layoutShared;

  const TAB_ICON = { tracks: 'stack', dupes: 'warning-circle', stats: 'chart-bar', notes: 'bookmark-simple', library: 'tag', discover: 'plus-circle', theme: 'gear' };

  function scanRing(ctx) {
    const { state } = ctx;
    const s = state.scan;
    const pct = s && s.total ? Math.min(1, s.n / s.total) : null;
    const deg = pct != null ? Math.round(pct * 360) : null;
    return `<div class="lo-rail-ring" title="Scanning…" style="${deg != null ? `background:conic-gradient(var(--color-accent) ${deg}deg, var(--color-neutral-800) 0deg)` : ''}">
      <div class="lo-rail-ring-inner">${deg != null ? Math.round(pct * 100) + '%' : ctx.icons('arrows-clockwise')}</div>
    </div>`;
  }

  function rail(ctx) {
    const { state } = ctx;
    const tabs = LS().tabList(ctx);
    const main = tabs.filter(([k]) => k !== 'theme');
    const gearTab = tabs.find(([k]) => k === 'theme');
    const stack = ([k, l, n]) => `<button class="lo-rail-stack ${state.tab === k ? 'on' : ''}" data-tab="${k}" title="${l}">
        <span class="lo-rail-stack-icon">${ctx.icons(TAB_ICON[k] || 'stack')}</span>
        ${n ? `<span class="num lo-rail-stack-n">${n}</span>` : ''}
      </button>`;
    return `<nav class="lo-rail-nav">
      <div class="lo-rail-mark">${state.loading ? scanRing(ctx) : ctx.icons('musical-notes')}</div>
      <div class="lo-rail-stacks">${main.map(stack).join('')}</div>
      <span class="lo-spacer"></span>
      ${gearTab ? stack(gearTab) : ''}
    </nav>`;
  }

  function contentHeader(ctx) {
    const { h, state } = ctx;
    const title = state.page === 'playlist' ? state.header.title || 'Playlist' : state.page === 'library' ? 'Library' : 'Playlist Organizer';
    return `<header class="lo-rail-head">
      <h2 class="lo-rail-title" title="${h(title)}">${h(title)}</h2>
      ${LS().fullscreenButton(ctx)}
      <button class="btn btn-icon btn-secondary" data-act="close" title="Close" aria-label="Close">${ctx.icons('x')}</button>
    </header>`;
  }

  function tracksToolbar(ctx) {
    const { h, state, icons } = ctx;
    const busy = state.loading || !!state.batch;
    const applyBtn = ctx.canApplyOrder()
      ? `<button class="btn btn-secondary" data-act="apply-order" ${busy ? 'disabled' : ''} title="Physically move every track in ${h(
          ctx.dom.serviceName
        )} to match this sort">Apply order</button>`
      : '';
    return `<button class="btn btn-primary" data-act="scan" ${busy ? 'disabled' : ''}>${icons('arrows-clockwise')}${state.tracks.length ? 'Rescan' : 'Scan playlist'}</button>
      <div class="lo-cl-search">${icons('magnifying-glass')}<input type="search" class="input" placeholder="Filter" value="${h(state.filter)}" data-in="filter"></div>
      <select class="input lo-cl-sortsel" data-in="sort" title="Sort">${ctx
        .getSorts()
        .map(([k, l]) => `<option value="${k}" ${state.sortKey === k ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>
      ${applyBtn}`;
  }

  function railRow(ctx, t) {
    const { h, state, icons } = ctx;
    const sel = state.selected.has(t.key);
    const dateText = ctx.dateDisplay(t);
    const canDrag = !state.filter.trim();
    return `<div class="lo-rail-row ${sel ? 'sel' : ''} ${t.unavailable ? 'unavail' : ''}" data-key="${h(t.key)}" draggable="${canDrag}">
      <span class="lo-draghandle" title="${canDrag ? 'Drag to reorder — drag a checked row to move every checked row together' : 'Clear the filter to drag-reorder'}">${icons('dots-six-vertical')}</span>
      <input type="checkbox" data-chk="${h(t.key)}" ${sel ? 'checked' : ''}>
      <span class="num lo-rail-idx">${t.index + 1}</span>
      ${t.thumbnail ? `<img class="lo-cl-thumb" src="${h(t.thumbnail)}" alt="" loading="lazy">` : `<div class="lo-cl-thumb lo-cl-thumb-ph"></div>`}
      <div class="lo-rail-row-meta">
        <div class="lo-cl-tt">${h(t.title)}</div>
        <div class="muted lo-cl-meta">${h(t.artist)}${t.album ? ' · ' + h(t.album) : ''}${dateText ? ' · ' + h(dateText) : ''}</div>
      </div>
      <span class="num">${h(t.durationText)}</span>
      ${t.unavailable ? '<span class="tag" style="color:var(--color-muted-2)">unavailable</span>' : ''}
    </div>`;
  }

  function emptyTracks(ctx) {
    const { h, icons, state } = ctx;
    const tagCount = state.meta.tags.length;
    return `<div class="lo-cl-empty">
      <div class="lo-cl-empty-icon muted-2">${icons('stack')}</div>
      <h3>Scan this playlist</h3>
      <p class="muted">${h(ctx.dom.scanHint)}</p>
      ${tagCount ? `<p class="muted">This playlist already has ${tagCount} saved tag${tagCount === 1 ? '' : 's'}.</p>` : ''}
      <div class="lo-cl-empty-actions">
        <button class="btn btn-primary" data-act="scan">${icons('arrows-clockwise')}Scan playlist</button>
        <button class="btn btn-secondary" data-act="scan-visible">Scan visible only</button>
      </div>
    </div>`;
  }

  function tracksList(ctx, scanning) {
    const { state } = ctx;
    const list = ctx.visibleTracks();
    if (!list.length && !scanning) return `<div class="empty muted">No tracks match your filter.</div>`;
    return `<div class="lo-rail-rows">${list.map((t) => railRow(ctx, t)).join('')}${scanning ? LS().skeletonRows(4) : ''}</div>`;
  }

  function tracksBody(ctx) {
    const { state } = ctx;
    if (state.loading) return `${LS().scanStatusBar(ctx)}${tracksList(ctx, true)}`;
    if (!state.tracks.length) return emptyTracks(ctx);
    return tracksList(ctx, false);
  }

  function dupesToolbar(ctx) {
    const { h, state } = ctx;
    const busy = state.loading || !!state.batch;
    return `<div class="lo-segmented" role="group" aria-label="Match mode">${LS()
      .MATCH_MODES.map(([v, l]) => `<button class="${state.matchMode === v ? 'on' : ''}" data-act="matchmode" data-mm="${v}">${h(l)}</button>`)
      .join('')}</div>
    <div class="lo-segmented" role="group" aria-label="Keep rule">${[
      ['earliest', 'Keep earliest'],
      ['longest', 'Keep longest'],
      ['official', 'Keep official'],
    ]
      .map(([v, l]) => `<button class="${state.keepRule === v ? 'on' : ''}" data-act="keeprule" data-kr="${v}">${h(l)}</button>`)
      .join('')}</div>
    <span class="lo-spacer"></span>
    <button class="btn btn-secondary" data-act="select-dupes" ${busy || !state.tracks.length ? 'disabled' : ''}>Select all but keeper</button>
    <button class="btn btn-secondary" data-act="clear-sel">Clear</button>`;
  }

  function compareCard(ctx, t, isKeep) {
    const { h, state } = ctx;
    const sel = state.selected.has(t.key);
    const dateText = ctx.dateDisplay(t);
    return `<div class="lo-rail-compare-card ${isKeep ? 'keep' : 'rm'} ${sel ? 'sel' : ''}" data-key="${h(t.key)}">
      <div class="lo-rail-compare-top">
        <input type="checkbox" data-chk="${h(t.key)}" ${sel ? 'checked' : ''} ${isKeep ? 'title="Suggested keeper"' : ''}>
        ${isKeep ? '<span class="tag tag-outline lo-cl-keeptag">keep</span>' : ''}
      </div>
      ${t.thumbnail ? `<img class="lo-cl-thumb" src="${h(t.thumbnail)}" alt="" loading="lazy">` : `<div class="lo-cl-thumb lo-cl-thumb-ph"></div>`}
      <div class="lo-rail-compare-title">${h(t.title)}</div>
      <div class="muted lo-rail-compare-meta">#${t.index + 1} · ${h(t.artist)}${t.album ? ' · ' + h(t.album) : ''}${dateText ? ' · ' + h(dateText) : ''} · ${h(t.durationText)}</div>
    </div>`;
  }

  function dupesBody(ctx) {
    const { h, state } = ctx;
    if (!state.tracks.length) return `<div class="empty muted">Scan the playlist first.</div>`;
    const groups = LS().visibleDupeGroups(ctx);
    if (!groups.length)
      return `<div class="empty muted">No duplicates found under this match mode.${state.matchMode !== 'fuzzy' ? ' Try "Fuzzy" to also catch remixes and collabs.' : ''}</div>`;
    const tagLabel = { exact: 'exact', same: 'same song', version: 'version', collab: 'collab' };
    return groups
      .map(
        (g) => `<div class="lo-rail-group">
      <div class="lo-rail-group-head">${(g.type === 'exact' ? ['exact'] : g.tags && g.tags.length ? g.tags : ['same'])
        .map((k) => `<span class="tag ${k === 'version' ? 'tag-outline' : 'tag-accent'}">${tagLabel[k] || k}</span>`)
        .join('')}<span class="lo-cl-dupgroup-title" title="${h(g.label)}">${h(g.label)}</span><span class="muted-2 num">×${g.tracks.length}</span></div>
      <div class="lo-rail-compare-row">${g.tracks.map((t, i) => compareCard(ctx, t, i === 0)).join('')}</div>
    </div>`
      )
      .join('');
  }

  function footer(ctx) {
    const { state } = ctx;
    if (state.page !== 'playlist') return '';
    const n = state.selected.size;
    const busy = state.loading || !!state.batch;
    const has = state.tracks.length > 0;
    return `<footer class="lo-cl-foot">
      <span class="muted lo-cl-selinfo">${n ? `${n} selected` : has ? 'Select tracks for bulk actions' : ''}</span>
      <span class="lo-spacer"></span>
      <button class="btn btn-secondary" data-act="add-sel" ${!n || busy ? 'disabled' : ''} title="${!n ? 'Select tracks first' : ''}">Add to playlist…</button>
      <button class="btn" style="border-color:#a24a3f;color:#e8a99c" data-act="remove-sel" ${!n || busy ? 'disabled' : ''} title="${!n ? 'Select tracks first' : ''}">Remove selected</button>
    </footer>`;
  }

  function progressBar(ctx) {
    const { h, state } = ctx;
    if (!state.progress || state.loading) return '';
    const p = state.progress;
    return `<div class="lo-cl-progress ${p.kind || ''}">
      <span class="lo-cl-progress-text">${h(p.text)}</span>
      ${state.batch ? '<button class="btn btn-secondary btn-icon" data-act="cancel" title="Stop">' + ctx.icons('x') + '</button>' : '<button class="btn btn-icon btn-secondary" data-act="dismiss" title="Dismiss">' + ctx.icons('x') + '</button>'}
      ${p.pct != null ? `<div class="lo-cl-progress-track"><div style="width:${Math.round(p.pct * 100)}%"></div></div>` : ''}
    </div>`;
  }

  function onAction(act, el, ctx) {
    if (act === 'scan-visible') {
      ctx.scan({ visibleOnly: true });
      return true;
    }
    if (act === 'matchmode') {
      ctx.setMatchMode(el.dataset.mm);
      return true;
    }
    if (act === 'keeprule') {
      ctx.setKeepRule(el.dataset.kr);
      return true;
    }
    return false;
  }

  function render(ctx, els) {
    const { state } = ctx;
    let toolbarHtml = '';
    let bodyHtml = '';
    if (state.tab === 'tracks') {
      toolbarHtml = tracksToolbar(ctx);
      bodyHtml = tracksBody(ctx);
    } else if (state.tab === 'dupes') {
      toolbarHtml = dupesToolbar(ctx);
      bodyHtml = dupesBody(ctx);
    } else if (state.tab === 'stats') {
      bodyHtml = LS().statsBody(ctx);
    } else if (state.tab === 'notes') {
      bodyHtml = LS().notesBody(ctx);
    } else if (state.tab === 'library') {
      toolbarHtml = LS().taggedBar(ctx);
      bodyHtml = LS().taggedBody(ctx);
    } else if (state.tab === 'discover') {
      bodyHtml = LS().discoverBody(ctx);
    } else if (state.tab === 'theme') {
      bodyHtml = LS().themeBody(ctx);
    }
    ctx.setHTML(
      els.shell,
      `<div class="lo-rail">
        ${rail(ctx)}
        <div class="lo-rail-content">
          ${contentHeader(ctx)}
          ${toolbarHtml ? `<div class="lo-cl-toolbar rule-b">${toolbarHtml}</div>` : ''}
          <div class="lo-scroll">${bodyHtml}</div>
          ${progressBar(ctx)}
          ${footer(ctx)}
        </div>
      </div>`
    );
  }

  YTMO.layouts = YTMO.layouts || {};
  YTMO.layouts.rail = { render, onAction };
})();
