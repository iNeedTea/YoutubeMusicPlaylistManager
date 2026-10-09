/* global window */
// Spine layout — a vertical timeline down the middle of the panel. Empty
// state is four numbered steps; scanning shows an equalizer meter plus a
// glowing head node; duplicates render as physical merge stacks; the footer
// is a Cmd+K-style command bar instead of a button row.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const LS = () => YTMO.layoutShared;

  // Layout-local UI state (which merge stacks are expanded) — presentational
  // only, so it lives outside the shared cross-layout `state` object.
  const expanded = new Set();

  function head(ctx) {
    const { h, state } = ctx;
    const title = state.page === 'playlist' ? state.header.title || 'Playlist' : state.page === 'library' ? 'Library' : 'Playlist Organizer';
    return `<header class="lo-sp-head">
      <h2 class="lo-sp-title" title="${h(title)}">${h(title)}</h2>
      <button class="btn btn-icon btn-secondary" data-act="close" title="Close" aria-label="Close">${ctx.icons('x')}</button>
    </header>`;
  }

  function tabsBar(ctx) {
    const { state } = ctx;
    const tabs = LS().tabList(ctx);
    return `<nav class="lo-sp-tabs">${tabs
      .map(([k, l, n]) => `<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}">${l}${n ? `<span class="lo-cl-count">${n}</span>` : ''}</button>`)
      .join('')}</nav>`;
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

  function emptySteps(ctx) {
    const { h } = ctx;
    const steps = [
      ['Scan the playlist', ctx.dom.scanHint, true],
      ['Review duplicates', 'See exact and fuzzy matches side by side.', false],
      ['Choose what to keep', 'Pick earliest, longest, or the official release.', false],
      ['Merge & clean up', 'Remove the copies you do not want, all at once.', false],
    ];
    return `<div class="lo-sp-steps">${steps
      .map(
        ([title, desc, active], i) => `<div class="lo-sp-step ${active ? 'active' : ''}">
        <span class="lo-sp-step-node">${i + 1}</span>
        <div class="lo-sp-step-body">
          <div class="lo-sp-step-title">${h(title)}</div>
          <div class="muted lo-sp-step-desc">${h(desc)}</div>
          ${
            active
              ? `<div class="lo-cl-empty-actions" style="justify-content:flex-start;margin-top:var(--space-3)">
                  <button class="btn btn-primary" data-act="scan">Scan playlist</button>
                  <button class="btn btn-secondary" data-act="scan-visible">Scan visible only</button>
                </div>`
              : ''
          }
        </div>
      </div>`
      )
      .join('')}</div>`;
  }

  function equalizer() {
    let bars = '';
    for (let i = 0; i < 18; i++) {
      const pct = 25 + Math.round(Math.abs(Math.sin(i * 1.7)) * 65);
      bars += `<span class="lo-sp-eqbar" style="height:${pct}%; animation-delay:${(i * 0.07).toFixed(2)}s"></span>`;
    }
    return `<div class="lo-sp-eq">${bars}</div>`;
  }

  function trackNode(ctx, t, isHead) {
    const { h, state, icons } = ctx;
    const sel = state.selected.has(t.key);
    const dateText = ctx.dateDisplay(t);
    const canDrag = !state.filter.trim();
    return `<div class="lo-sp-node-row ${sel ? 'sel' : ''} ${t.unavailable ? 'unavail' : ''} ${isHead ? 'head' : ''}" data-key="${h(t.key)}" draggable="${canDrag}">
      <span class="lo-sp-node"></span>
      <span class="lo-draghandle" title="${canDrag ? 'Drag to reorder — drag a checked row to move every checked row together' : 'Clear the filter to drag-reorder'}">${icons('dots-six-vertical')}</span>
      <input type="checkbox" data-chk="${h(t.key)}" ${sel ? 'checked' : ''}>
      <span class="num lo-sp-idx">${t.index + 1}</span>
      <div class="lo-sp-node-meta">
        <div class="lo-cl-tt">${h(t.title)}</div>
        <div class="muted lo-cl-meta">${h(t.artist)}${t.album ? ' · ' + h(t.album) : ''}${dateText ? ' · ' + h(dateText) : ''}</div>
      </div>
      <span class="num">${h(t.durationText)}</span>
    </div>`;
  }

  function scanningTracks(ctx) {
    const { state } = ctx;
    const list = state.tracks;
    return `${equalizer()}
    ${LS().scanStatusBar(ctx)}
    <div class="lo-sp-track-list">${list.map((t, i) => trackNode(ctx, t, i === list.length - 1)).join('')}${LS().skeletonRows(3)}</div>`;
  }

  function tracksBody(ctx) {
    const { state } = ctx;
    if (state.loading) return scanningTracks(ctx);
    if (!state.tracks.length) return emptySteps(ctx);
    const list = ctx.visibleTracks();
    if (!list.length) return `<div class="empty muted">No tracks match your filter.</div>`;
    return `<div class="lo-sp-track-list">${list.map((t) => trackNode(ctx, t, false)).join('')}</div>`;
  }

  function dupesToolbar(ctx) {
    const { h, state } = ctx;
    return `<div class="lo-segmented" role="group" aria-label="Match mode">${LS()
      .MATCH_MODES.map(([v, l]) => `<button class="${state.matchMode === v ? 'on' : ''}" data-act="matchmode" data-mm="${v}">${h(l)}</button>`)
      .join('')}</div>
    <div class="lo-segmented" role="group" aria-label="Keep rule">${[
      ['earliest', 'Keep earliest'],
      ['longest', 'Keep longest'],
      ['official', 'Keep official'],
    ]
      .map(([v, l]) => `<button class="${state.keepRule === v ? 'on' : ''}" data-act="keeprule" data-kr="${v}">${h(l)}</button>`)
      .join('')}</div>`;
  }

  function mergeStack(ctx, g) {
    const { h, state } = ctx;
    const keeper = g.tracks[0];
    const removals = g.tracks.slice(1);
    const isOpen = expanded.has(g.key);
    return `<div class="lo-sp-stack ${removals.length > 1 ? 'deep' : ''}" data-key="${h(g.key)}">
      <div class="lo-sp-stack-card">
        ${keeper.thumbnail ? `<img class="lo-cl-thumb" src="${h(keeper.thumbnail)}" alt="" loading="lazy">` : `<div class="lo-cl-thumb lo-cl-thumb-ph"></div>`}
        <div class="lo-sp-stack-meta">
          <div class="lo-cl-tt" title="${h(keeper.title)}">${h(keeper.title)}</div>
          <div class="muted lo-cl-meta">${h(keeper.artist)} · ${g.tracks.length} copies</div>
        </div>
        <button class="btn btn-secondary" data-act="toggle-group" data-key="${h(g.key)}">${isOpen ? 'Hide' : 'Merge ×' + removals.length}</button>
      </div>
      ${
        isOpen
          ? `<div class="lo-sp-stack-removals">${removals
              .map(
                (t) => `<div class="lo-sp-removal-line" data-key="${h(t.key)}">
            <input type="checkbox" data-chk="${h(t.key)}" ${state.selected.has(t.key) ? 'checked' : ''}>
            <span class="num">-${String(t.index + 1).padStart(3, '0')} ${h(t.durationText)} · ${h(ctx.dateDisplay(t) || '—')}</span>
            <span class="muted">${h(t.title)}</span>
          </div>`
              )
              .join('')}</div>`
          : ''
      }
    </div>`;
  }

  function dupesBody(ctx) {
    const { state } = ctx;
    if (!state.tracks.length) return `<div class="empty muted">Scan the playlist first.</div>`;
    const groups = LS().visibleDupeGroups(ctx);
    if (!groups.length)
      return `<div class="empty muted">No duplicates found under this match mode.${state.matchMode !== 'fuzzy' ? ' Try "Fuzzy" to also catch remixes and collabs.' : ''}</div>`;
    return `<div class="lo-sp-stacks">${groups.map((g) => mergeStack(ctx, g)).join('')}</div>`;
  }

  function commandBar(ctx) {
    const { state } = ctx;
    const groups = LS().visibleDupeGroups(ctx);
    const totalRemovals = groups.reduce((s, g) => s + g.tracks.length - 1, 0);
    if (!groups.length) return '';
    const busy = state.loading || !!state.batch;
    return `<button class="lo-sp-cmdbar" data-act="merge-all" ${!totalRemovals || busy ? 'disabled' : ''}>
      <span>Merge all ${groups.length} stack${groups.length === 1 ? '' : 's'} — removes ${totalRemovals} track${totalRemovals === 1 ? '' : 's'}</span>
      <span class="lo-sp-cmdkey">⏎</span>
    </button>`;
  }

  function actionFooter(ctx) {
    const { state } = ctx;
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

  function footer(ctx) {
    const { state } = ctx;
    if (state.page !== 'playlist') return '';
    if (state.tab === 'dupes' && state.tracks.length) return commandBar(ctx);
    return actionFooter(ctx);
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
    if (act === 'toggle-group') {
      const k = el.dataset.key;
      if (expanded.has(k)) expanded.delete(k);
      else expanded.add(k);
      return true;
    }
    if (act === 'merge-all') {
      const groups = LS().visibleDupeGroups(ctx);
      for (const g of groups) g.tracks.slice(1).forEach((t) => ctx.state.selected.add(t.key));
      ctx.removeSelected();
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
    } else if (state.tab === 'theme') {
      bodyHtml = LS().themeBody(ctx);
    }
    ctx.setHTML(
      els.shell,
      `<div class="lo-spine">
        ${head(ctx)}
        ${tabsBar(ctx)}
        ${toolbarHtml ? `<div class="lo-cl-toolbar rule-b">${toolbarHtml}</div>` : ''}
        <div class="lo-scroll">${bodyHtml}</div>
        ${progressBar(ctx)}
        ${footer(ctx)}
      </div>`
    );
  }

  YTMO.layouts = YTMO.layouts || {};
  YTMO.layouts.spine = { render, onAction };
})();
