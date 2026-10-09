/* global window */
// Console layout — monospace, dense, technical. Scanning renders as a live
// log with a blinking cursor and a 20-cell batch meter; duplicates render as
// a +/- diff; the footer is a compact status bar (csv/json/copy/add/apply).
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const LS = () => YTMO.layoutShared;

  const TAB_LABEL = { tracks: 'tracks', dupes: 'dupes', stats: 'stats', notes: 'tags', library: 'lib', theme: 'set' };

  function head(ctx) {
    const { h, state } = ctx;
    const title = state.page === 'playlist' ? state.header.title || 'playlist' : state.page === 'library' ? 'library' : 'playlist organizer';
    const status = state.loading
      ? `scanning… ${state.scan ? state.scan.n : 0}${state.scan && state.scan.total ? '/' + state.scan.total : ''}`
      : state.tracks.length
      ? `${state.tracks.length} tracks · ${LS().visibleDupeGroups(ctx).length} dupes`
      : 'not scanned';
    return `<header class="lo-cn-head">
      <span class="lo-cn-word">ORGANIZER</span>
      <span class="lo-cn-status muted" title="${h(title)}">${h(title)} — ${h(status)}</span>
      <span class="lo-spacer"></span>
      <button class="btn btn-icon btn-secondary" data-act="close" title="Close" aria-label="Close">${ctx.icons('x')}</button>
    </header>`;
  }

  function tabsRow(ctx) {
    const { state } = ctx;
    const tabs = LS().tabList(ctx);
    return `<nav class="lo-cn-tabs rule-b">${tabs
      .map(([k, l, n]) => `<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}">${TAB_LABEL[k] || k}${n ? ` ${n}` : ''}</button>`)
      .join('')}</nav>`;
  }

  function tracksToolbar(ctx) {
    const { h, state, icons } = ctx;
    const busy = state.loading || !!state.batch;
    const applyBtn = ctx.canApplyOrder()
      ? `<button class="btn btn-secondary" data-act="apply-order" ${busy ? 'disabled' : ''} title="physically move every track in ${h(
          ctx.dom.serviceName
        )} to match this sort">apply order</button>`
      : '';
    return `<button class="btn btn-primary" data-act="scan" ${busy ? 'disabled' : ''}>${state.tracks.length ? 'rescan' : 'scan'}</button>
      <input type="search" class="input" placeholder="filter" value="${h(state.filter)}" data-in="filter" style="padding-left:10px">
      <select class="input lo-cl-sortsel" data-in="sort" title="sort">${ctx
        .getSorts()
        .map(([k, l]) => `<option value="${k}" ${state.sortKey === k ? 'selected' : ''}>${l.toLowerCase()}</option>`)
        .join('')}</select>
      ${applyBtn}`;
  }

  function emptyTracks(ctx) {
    const { h, icons, state } = ctx;
    return `<div class="lo-cl-empty">
      <p class="muted lo-cn-mono">$ awaiting scan</p>
      <p class="muted">${h(ctx.dom.scanHint)}</p>
      <div class="lo-cl-empty-actions">
        <button class="btn btn-primary" data-act="scan">scan</button>
        <button class="btn btn-secondary" data-act="scan-visible">scan --visible-only</button>
      </div>
    </div>`;
  }

  function tracksRow(ctx, t) {
    const { h, state, icons } = ctx;
    const sel = state.selected.has(t.key);
    const canDrag = !state.filter.trim();
    return `<div class="lo-cn-row ${sel ? 'sel' : ''} ${t.unavailable ? 'unavail' : ''}" data-key="${h(t.key)}" draggable="${canDrag}">
      <span class="lo-draghandle" title="${canDrag ? 'drag to reorder — drag a checked row to move every checked row together' : 'clear the filter to drag-reorder'}">${icons('dots-six-vertical')}</span>
      <input type="checkbox" data-chk="${h(t.key)}" ${sel ? 'checked' : ''}>
      <span class="num lo-cn-col-pos">${String(t.index + 1).padStart(3, '0')}</span>
      <span class="lo-cn-col-title">${h(t.title)}</span>
      <span class="muted lo-cn-col-artist">${h(t.artist)}</span>
      <span class="num lo-cn-col-len">${h(t.durationText)}</span>
      ${t.unavailable ? '<span class="lo-cn-tag-skip">skip</span>' : ''}
    </div>`;
  }

  function logLine(ctx, t, i, seenIds) {
    const s = ctx.state.scan;
    const t0 = s ? s.startedAt : Date.now();
    const perTrack = s && s.n ? Math.max(60, (Date.now() - s.startedAt) / s.n) : 220;
    const ts = new Date(t0 + i * perTrack);
    const time = ts.toTimeString().slice(0, 8);
    const isDupe = t.videoId && seenIds.has(t.videoId);
    if (t.videoId) seenIds.add(t.videoId);
    const verb = t.unavailable ? 'skip' : isDupe ? 'dupe' : 'read';
    const cls = t.unavailable ? 'skip' : isDupe ? 'dupe' : '';
    return `<div class="lo-cn-logline ${cls}">${time} ${verb} ${String(i + 1).padStart(3, '0')} ${ctx.h(t.title)}</div>`;
  }

  function batchMeter(pct) {
    const filled = Math.max(0, Math.min(20, Math.round((pct || 0) * 20)));
    let cells = '';
    for (let i = 0; i < 20; i++) cells += `<span class="lo-cn-cell ${i < filled ? 'on' : ''}"></span>`;
    return `<div class="lo-cn-meter">${cells}</div>`;
  }

  function scanningTracks(ctx) {
    const { state } = ctx;
    const s = state.scan;
    const pct = s && s.total ? Math.min(1, s.n / s.total) : null;
    const seen = new Set();
    const log = state.tracks.map((t, i) => logLine(ctx, t, i, seen)).join('');
    return `<div class="lo-cn-log">
      ${log}
      <div class="lo-cn-logline lo-cn-cursor">&nbsp;</div>
    </div>
    ${batchMeter(pct)}
    <div class="lo-cn-scanmeta muted">${s ? s.n : 0}${s && s.total ? ' / ' + s.total : ''} read${LS().scanEta(state) ? ' · ' + LS().scanEta(state) : ''}</div>`;
  }

  function tracksBody(ctx) {
    const { state } = ctx;
    if (state.loading) return scanningTracks(ctx);
    if (!state.tracks.length) return emptyTracks(ctx);
    const list = ctx.visibleTracks();
    if (!list.length) return `<div class="empty muted">no tracks match filter</div>`;
    return `<div class="lo-cn-rows">${list.map((t) => tracksRow(ctx, t)).join('')}</div>`;
  }

  function dupesToolbar(ctx) {
    const { h, state } = ctx;
    return `<div class="lo-segmented" role="group" aria-label="match mode">${LS()
      .MATCH_MODES.map(([v, l]) => `<button class="${state.matchMode === v ? 'on' : ''}" data-act="matchmode" data-mm="${v}">${h(l.toLowerCase())}</button>`)
      .join('')}</div>
    <div class="lo-segmented" role="group" aria-label="keep rule">${[
      ['earliest', 'earliest'],
      ['longest', 'longest'],
      ['official', 'official'],
    ]
      .map(([v, l]) => `<button class="${state.keepRule === v ? 'on' : ''}" data-act="keeprule" data-kr="${v}">keep ${l}</button>`)
      .join('')}</div>`;
  }

  function diffRow(ctx, t, isKeep) {
    const { h, state } = ctx;
    const dateText = ctx.dateDisplay(t);
    return `<div class="lo-cn-diffrow ${isKeep ? 'plus' : 'minus'}" data-key="${h(t.key)}">
      <input type="checkbox" data-chk="${h(t.key)}" ${state.selected.has(t.key) ? 'checked' : ''}>
      <span class="lo-cn-diffsign">${isKeep ? '+' : '-'}</span>
      <span class="num lo-cn-col-pos">${String(t.index + 1).padStart(3, '0')}</span>
      <span class="lo-cn-col-title">${h(t.title)}</span>
      <span class="num lo-cn-col-len">${h(t.durationText)}</span>
      <span class="muted lo-cn-col-artist">${h(dateText || t.artist)}</span>
    </div>`;
  }

  function dupesBody(ctx) {
    const { h, state } = ctx;
    if (!state.tracks.length) return `<div class="empty muted">scan the playlist first</div>`;
    const groups = LS().visibleDupeGroups(ctx);
    if (!groups.length) return `<div class="empty muted">no duplicates under this match mode</div>`;
    return groups
      .map(
        (g) => `<div class="lo-cn-diffgroup">
      <div class="lo-cn-diffhead muted-2">${h(g.label)} ×${g.tracks.length}</div>
      ${g.tracks.map((t, i) => diffRow(ctx, t, i === 0)).join('')}
    </div>`
      )
      .join('');
  }

  function statusBar(ctx) {
    const { state } = ctx;
    if (state.page !== 'playlist') return '';
    const marked = state.selected.size;
    const kept = state.tracks.length - marked;
    const busy = state.loading || !!state.batch;
    return `<footer class="lo-cn-status-bar">
      <span class="lo-cn-marked">${marked} marked -</span>
      <span class="lo-cn-kept">${kept} kept +</span>
      <span class="lo-spacer"></span>
      <button class="btn btn-secondary" data-act="add-sel" ${!marked || busy ? 'disabled' : ''}>add</button>
      <button class="btn" style="border-color:#a24a3f;color:#e8a99c" data-act="remove-sel" ${!marked || busy ? 'disabled' : ''}>apply</button>
    </footer>`;
  }

  function progressBar(ctx) {
    const { h, state } = ctx;
    if (!state.progress || state.loading) return '';
    const p = state.progress;
    return `<div class="lo-cl-progress ${p.kind || ''}">
      <span class="lo-cl-progress-text">${h(p.text)}</span>
      ${state.batch ? '<button class="btn btn-secondary btn-icon" data-act="cancel" title="stop">' + ctx.icons('x') + '</button>' : '<button class="btn btn-icon btn-secondary" data-act="dismiss" title="dismiss">' + ctx.icons('x') + '</button>'}
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
    } else if (state.tab === 'theme') {
      bodyHtml = LS().themeBody(ctx);
    }
    ctx.setHTML(
      els.shell,
      `<div class="lo-console">
        ${head(ctx)}
        ${tabsRow(ctx)}
        ${toolbarHtml ? `<div class="lo-cn-toolbar">${toolbarHtml}</div>` : ''}
        <div class="lo-scroll">${bodyHtml}</div>
        ${progressBar(ctx)}
        ${statusBar(ctx)}
      </div>`
    );
  }

  YTMO.layouts = YTMO.layouts || {};
  YTMO.layouts.console = { render, onAction };
})();
