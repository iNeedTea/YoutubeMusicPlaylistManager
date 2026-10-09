/* global window */
// Classic tabs layout — closest to the pre-redesign panel. Header row with a
// mark + title + source chip + subline + wordmark + close; a tab strip;
// a toolbar (Scan / filter / sort); track rows with an index, thumbnail,
// title/metadata and a trailing tag; a footer strip with bulk actions.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const LS = () => YTMO.layoutShared;

  function serviceChip(ctx) {
    const isSpotify = ctx.YTMO.site.isSpotify;
    return `<span class="tag lo-cl-chip">${ctx.icons(isSpotify ? 'waveform' : 'musical-notes')}<span>${isSpotify ? 'Spotify' : 'YouTube Music'}</span></span>`;
  }

  function head(ctx) {
    const { h, state } = ctx;
    const title = state.page === 'playlist' ? state.header.title || 'Playlist' : state.page === 'library' ? 'Library' : 'Playlist Organizer';
    const sub =
      state.page === 'playlist'
        ? state.tracks.length
          ? `${state.tracks.length} tracks scanned · ${h(ctx.formatTotal(ctx.stats().total))}`
          : h(state.header.subtitle || 'Not scanned yet')
        : state.page === 'library'
        ? 'Tag and colour your playlists'
        : 'Open a playlist to organize it';
    return `<header class="lo-cl-head">
      <div class="lo-cl-mark">${ctx.icons('musical-notes')}</div>
      <div class="lo-cl-title-wrap">
        <h2>${state.meta.color ? `<span class="lo-cl-dot" style="background:${h(state.meta.color)}"></span>` : ''}<span class="lo-cl-title-text">${h(title)}</span>${
      state.page === 'playlist' ? serviceChip(ctx) : ''
    }</h2>
        <div class="muted lo-cl-sub">${sub}</div>
      </div>
      <div class="lo-cl-word muted-2">Organizer</div>
      <button class="btn btn-icon btn-secondary" data-act="close" title="Close" aria-label="Close">${ctx.icons('x')}</button>
    </header>`;
  }

  function tabsBar(ctx) {
    const { state } = ctx;
    const tabs = LS().tabList(ctx);
    return `<nav class="lo-cl-tabs rule-b">${tabs
      .map(([k, l, n]) => `<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}">${l}${n ? `<span class="lo-cl-count">${n}</span>` : ''}</button>`)
      .join('')}</nav>`;
  }

  function tracksToolbar(ctx) {
    const { h, state, icons } = ctx;
    const def = ctx.sortDef();
    const dirLabel = def[2] ? def[2][state.sortDir === 1 ? 0 : 1] : '';
    const busy = state.loading || !!state.batch;
    const datesBtn =
      ctx.dom.capabilities.releaseDates && state.tracks.length && state.dates !== 'done'
        ? `<button class="btn btn-secondary" data-act="dates" ${busy ? 'disabled' : ''} title="Look up release dates for every track">${
            state.dates === 'loading' ? 'Looking up dates…' : 'Get release dates'
          }</button>`
        : '';
    const total = ctx.dom.getExpectedTotal ? ctx.dom.getExpectedTotal() : 0;
    const liveBadge =
      !ctx.dom.capabilities.autoScroll && state.tracks.length && !state.loading
        ? `<span class="muted lo-cl-live" title="${h(ctx.dom.scanHint)}">${state.tracks.length}${total ? ' of ' + total : ''} loaded — keep scrolling</span>`
        : '';
    const applyBtn = ctx.canApplyOrder()
      ? `<button class="btn btn-secondary" data-act="apply-order" ${busy ? 'disabled' : ''} title="Physically move every track in ${h(
          ctx.dom.serviceName
        )} to match this sort">Apply order</button>`
      : '';
    return `<button class="btn btn-primary" data-act="scan" ${busy ? 'disabled' : ''}>${icons('arrows-clockwise')}${state.tracks.length ? 'Rescan' : 'Scan playlist'}</button>
      <div class="lo-cl-search">${icons('magnifying-glass')}<input type="search" class="input" placeholder="Filter title / artist / album / date" value="${h(state.filter)}" data-in="filter"></div>
      <select class="input lo-cl-sortsel" data-in="sort" title="Sort">${ctx
        .getSorts()
        .map(([k, l]) => `<option value="${k}" ${state.sortKey === k ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>
      <button class="btn btn-icon btn-secondary" data-act="sortdir" title="Toggle direction: ${h(dirLabel)}" ${def[2] ? '' : 'disabled'}>${state.sortDir === 1 ? '↓' : '↑'}</button>
      ${applyBtn}${datesBtn}${liveBadge}`;
  }

  function dupesToolbar(ctx) {
    const { h, state } = ctx;
    const s = state.settings;
    const busy = state.loading || !!state.batch;
    return `<div class="lo-cl-dupetoolbar">
      <div class="lo-segmented" role="group" aria-label="Match mode">${LS()
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
      <button class="btn btn-secondary" data-act="clear-sel">Clear</button>
    </div>`;
  }

  function taggedToolbar(ctx) {
    return LS().taggedBar(ctx);
  }

  function emptyTracks(ctx) {
    const { h, state, icons } = ctx;
    const tagCount = state.meta.tags.length;
    return `<div class="lo-cl-empty">
      <div class="lo-cl-empty-icon muted-2">${icons('list-magnifying-glass')}</div>
      <h3>Scan this playlist</h3>
      <p class="muted">${h(ctx.dom.scanHint)}</p>
      <p class="muted">Most playlists finish in a few seconds; a very long one can take longer since it has to load every track first.</p>
      ${tagCount ? `<p class="muted">This playlist already has ${tagCount} saved tag${tagCount === 1 ? '' : 's'} — see the Tags &amp; notes tab.</p>` : ''}
      <div class="lo-cl-empty-actions">
        <button class="btn btn-primary" data-act="scan">${icons('arrows-clockwise')}Scan playlist</button>
        <button class="btn btn-secondary" data-act="scan-visible">Scan visible only</button>
      </div>
    </div>`;
  }

  function scanningTracks(ctx) {
    const { state } = ctx;
    return `${LS().scanStatusBar(ctx)}${tracksTable(ctx, true)}`;
  }

  function trackRow(ctx, t) {
    const { h, state, icons } = ctx;
    const sel = state.selected.has(t.key);
    const dateText = ctx.dateDisplay(t);
    const canDrag = !state.filter.trim();
    return `<tr class="lo-cl-row ${sel ? 'sel' : ''} ${t.unavailable ? 'unavail' : ''}" data-key="${h(t.key)}" draggable="${canDrag}">
      <td class="lo-cl-draghandle"><span class="lo-draghandle" title="${canDrag ? 'Drag to reorder — drag a checked row to move every checked row together' : 'Clear the filter to drag-reorder'}">${icons('dots-six-vertical')}</span></td>
      <td class="lo-cl-chkcell"><input type="checkbox" data-chk="${h(t.key)}" ${sel ? 'checked' : ''}></td>
      <td class="num lo-cl-idx">${t.index + 1}</td>
      <td class="lo-cl-thumbcell">${t.thumbnail ? `<img class="lo-cl-thumb" src="${h(t.thumbnail)}" alt="" loading="lazy">` : `<div class="lo-cl-thumb lo-cl-thumb-ph"></div>`}</td>
      <td class="lo-cl-titlecell" title="${h(t.title)}">
        <div class="lo-cl-tt">${h(t.title)}</div>
        <div class="muted lo-cl-meta">${h(t.artist)}${t.album ? ' · ' + h(t.album) : ''}${dateText ? ' · ' + h(dateText) : ''}</div>
      </td>
      <td class="num lo-cl-dur">${h(t.durationText)}</td>
      <td class="lo-cl-tagcell">${t.unavailable ? '<span class="tag" style="color:var(--color-muted-2)">unavailable</span>' : ''}</td>
    </tr>`;
  }

  function tracksTable(ctx, scanning) {
    const { h, state } = ctx;
    const list = ctx.visibleTracks();
    if (!list.length && !scanning) return `<div class="empty muted">No tracks match your filter.</div>`;
    const allSel = list.length && list.every((t) => state.selected.has(t.key));
    const th = (k, l, cls = '') =>
      `<th class="${cls} ${state.sortKey === k ? 'sorted' : ''}" data-sort="${k}">${l}${state.sortKey === k ? (state.sortDir === 1 ? ' ↓' : ' ↑') : ''}</th>`;
    const missing = ctx.dom.capabilities.releaseDates ? state.tracks.filter((t) => !t.releaseDate).length : 0;
    const dateHint =
      !scanning && ctx.dom.capabilities.releaseDates && ctx.sortDef()[3] === 'release' && state.dates !== 'loading' && missing
        ? `<div class="muted lo-hint" style="padding:0 var(--space-6)">${missing} track${missing > 1 ? 's have' : ' has'} no release date${
            state.dates === 'done' ? "; they're listed last." : '. Click Get release dates to look them up.'
          }</div>`
        : '';
    return `${dateHint}<table class="lo-cl-table">
      <thead><tr>
        <th class="lo-cl-draghandle"></th>
        <th class="lo-cl-chkcell"><input type="checkbox" data-act="sel-visible" ${allSel ? 'checked' : ''} title="Select visible" ${scanning ? 'disabled' : ''}></th>
        ${th('index', '#')}<th></th>
        ${th('title', 'Title / Artist')}
        ${th('duration', 'Time', 'num')}
        <th></th>
      </tr></thead>
      <tbody>${list.map((t) => trackRow(ctx, t)).join('')}${scanning ? LS().skeletonRows(4) : ''}</tbody>
    </table>
    ${!scanning && list.length !== state.tracks.length ? `<div class="muted lo-hint" style="padding:0 var(--space-6)">${list.length} of ${state.tracks.length} shown</div>` : ''}`;
  }

  function tracksBody(ctx) {
    const { state } = ctx;
    if (state.loading) return scanningTracks(ctx);
    if (!state.tracks.length) return emptyTracks(ctx);
    return tracksTable(ctx, false);
  }

  function dupesBody(ctx) {
    const { h, state } = ctx;
    if (!state.tracks.length) return `<div class="empty muted">Scan the playlist first (Tracks tab).</div>`;
    const groups = LS().visibleDupeGroups(ctx);
    if (!groups.length)
      return `<div class="empty muted">No duplicates found under this match mode.${
        state.matchMode !== 'fuzzy' ? ' Try "Fuzzy" to also catch remixes and collabs.' : ''
      }</div>`;
    const tagLabel = { exact: 'exact', same: 'same song', version: 'version', collab: 'collab' };
    return (
      `<div class="muted lo-hint" style="padding:var(--space-3) var(--space-6) 0">The first (highlighted) track in each group is the suggested keeper for the current rule. Select the copies you want gone, then Remove selected below.</div>` +
      groups
        .map(
          (g) => `<div class="lo-cl-dupgroup">
        <div class="lo-cl-dupgroup-head">${(g.type === 'exact' ? ['exact'] : g.tags && g.tags.length ? g.tags : ['same'])
          .map((k) => `<span class="tag ${k === 'version' ? 'tag-outline' : 'tag-accent'}">${tagLabel[k] || k}</span>`)
          .join('')}<span class="lo-cl-dupgroup-title" title="${h(g.label)}">${h(g.label)}</span><span class="muted-2 num">×${g.tracks.length}</span></div>
        ${g.tracks
          .map(
            (t, i) => `<div class="lo-cl-duperow ${i === 0 ? 'keep' : ''}" data-key="${h(t.key)}">
          <input type="checkbox" data-chk="${h(t.key)}" ${state.selected.has(t.key) ? 'checked' : ''} ${i === 0 ? 'title="Suggested keeper"' : ''}>
          <span class="lo-cl-duperow-meta">${i === 0 ? '<span class="tag tag-outline lo-cl-keeptag">keep</span> ' : ''}<span class="num muted-2">#${t.index + 1}</span> ${h(t.title)} <small class="muted">· ${h(
              t.artist
            )}${t.album ? ' · ' + h(t.album) : ''}${ctx.dateDisplay(t) ? ' · ' + h(ctx.dateDisplay(t)) : ''} · ${h(t.durationText)}</small></span>
        </div>`
          )
          .join('')}
      </div>`
        )
        .join('')
    );
  }

  function footer(ctx) {
    const { state } = ctx;
    if (state.page !== 'playlist') return '';
    const n = state.selected.size;
    const busy = state.loading || !!state.batch;
    const has = state.tracks.length > 0;
    const disabledReason = !has ? (state.loading ? 'Finish scanning first' : 'Scan the playlist first') : '';
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
      toolbarHtml = taggedToolbar(ctx);
      bodyHtml = LS().taggedBody(ctx);
    } else if (state.tab === 'theme') {
      bodyHtml = LS().themeBody(ctx);
    }
    ctx.setHTML(
      els.shell,
      `<div class="lo-classic">
        ${head(ctx)}
        ${tabsBar(ctx)}
        ${toolbarHtml ? `<div class="lo-cl-toolbar">${toolbarHtml}</div>` : ''}
        <div class="lo-scroll">${bodyHtml}</div>
        ${progressBar(ctx)}
        ${footer(ctx)}
      </div>`
    );
  }

  YTMO.layouts = YTMO.layouts || {};
  YTMO.layouts.classic = { render, onAction };
})();
