/* global window */
// Body of the "Add music" tab (YTM only) — one implementation shared by all four layouts,
// like the Stats / Tags / Theme bodies in layout-shared.js. Pure markup: every control is
// wired by data-* attributes that panel.js's delegated click/input handlers pick up
// (data-act="disc-*", data-dsel, data-dgrp, data-dopt, data-in="disc-*").
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  const names = (t) => (t.artists && t.artists.length ? t.artists.join(', ') : '');

  // The five stops of the flow, shown at the top of every view so it's clear where you are and what comes next.
  const STEPS = ['Look up artists', 'Artists found', 'Find songs', 'Songs found', 'Add to playlist'];
  const stepper = (h, current) =>
    `<ol class="lo-disc-steps">${STEPS.map((s, i) => `<li class="${i + 1 < current ? 'done' : i + 1 === current ? 'cur' : ''}"><span class="lo-disc-stepn">${i + 1}</span>${h(s)}</li>`).join('')}</ol>`;

  function setupForm(ctx, busy) {
    const { h, state } = ctx;
    const d = state.disc;
    return `<div class="lo-section lo-disc">
      ${stepper(h, 1)}
      <b>Add music by artist</b>
      <div class="muted lo-hint">Step by step: look up the artists, check the list found, find their songs, review the songs, then add them to a playlist. Uses YouTube Music's own catalog, so only real songs appear (all albums, singles and EPs plus each artist's song list); some very old or region-locked releases may be missing. Nothing is added until the last step.</div>
      <input type="text" class="input lo-disc-input" data-in="disc-artist" placeholder="Artist or group (e.g. Seventeen)" value="${h(d.artistQuery)}" ${busy ? 'disabled' : ''}>
      ${lookupRow(ctx, busy)}
      ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      <div class="lo-disc-actions"><button class="btn btn-secondary" data-act="disc-search" ${busy ? 'disabled' : ''} title="Skip the online lookup: search YouTube Music for this artist only, without its members or franchise cast">${busy ? 'Searching…' : 'Find artist only'}</button></div>
    </div>`;
  }

  /** The opt-in member/cast lookup: nothing is sent anywhere until the button is clicked. */
  function lookupRow(ctx, busy) {
    const { h, state } = ctx;
    const d = state.disc;
    const l = d.lookup;
    const stale = l && YTMO.utils.normalizeKey(l.query) !== YTMO.utils.normalizeKey(d.artistQuery);
    let result = '';
    if (l && l.status === 'loading') result = '<div class="muted lo-hint">Looking up…</div>';
    else if (l && l.status === 'error') result = `<div class="lo-disc-error">Lookup failed: ${h(l.errors[0] || 'unknown error')}</div>`;
    else if (l && l.status === 'empty') result = `<div class="lo-disc-error">Couldn't find a member or cast list for “${h(l.query)}” on Wikipedia or MusicBrainz, so nothing was collected (an unfiltered search is what pulls in unrelated work). This only works for groups and franchises that have one — try the exact group/franchise name, or use “Find artist only” to search without it.${l.errors.length ? ' (' + h(l.errors[0]) + ')' : ''}</div>`;
    else if (l && l.status === 'done') {
      const p = l.pages[l.pick];
      const sel =
        l.pages.length > 1
          ? `<select class="input lo-disc-sel" data-in="disc-lookup-pick">${l.pages.map((x, i) => `<option value="${i}" ${i === l.pick ? 'selected' : ''}>${h(x.source)}: ${h(x.title)} — ${x.members.length} names</option>`).join('')}</select>`
          : '';
      result = `${sel}<div class="muted lo-hint">${stale ? 'This lookup is for “' + h(l.query) + '” — look up again for the current name. ' : ''}Using <a href="${h(p.url)}" target="_blank" rel="noopener">${h(p.source)}: ${h(p.title)}</a> — ${p.members.length} members/characters${p.units.length ? ' in ' + p.units.length + ' units' : ''}. ${
        d.franchise
          ? 'This looks like a franchise (characters with voice actors): its units and characters are found from the credits on its releases, and only acts matching this list are ticked and followed automatically.'
          : 'This looks like a group: its members and sub-units are searched for on YouTube Music.'
      }</div>`;
    }
    return `<div class="lo-disc-lookup">
      <button class="btn btn-primary" data-act="disc-lookup" ${busy || (l && l.status === 'loading') ? 'disabled' : ''}>Look up artists</button>
      <div class="muted lo-hint">Reads the real member / character list from Wikipedia and MusicBrainz (this sends the name typed above to them — nothing is sent unless you click) and finds each member and unit on YouTube Music. You then check the list of artists found before any songs are collected, which keeps voice actors' and other artists' unrelated work out. Whether it's a group (members and sub-units) or a game/anime franchise (units and characters) is worked out from the lookup.</div>
      ${result}
    </div>`;
  }

  const candSelect = (h, cands, pick, i) =>
    `<select class="input lo-disc-sel" data-in="disc-pick" data-i="${i}">${cands
      .map((c, n) => `<option value="${n}" ${n === pick ? 'selected' : ''}>${h(c.name)}${c.subtitle ? ' — ' + h(c.subtitle) : ''}</option>`)
      .join('')}${i === 'g' ? '' : `<option value="-1" ${pick < 0 ? 'selected' : ''}>Skip this member</option>`}</select>`;

  function confirmView(ctx) {
    const { h, state } = ctx;
    const d = state.disc;
    // Members the one-click flow couldn't match with confidence: every candidate as a checkbox (a unit Wikipedia calls
    // "Hoshi X Woozi" is "HxW" here), none ticked until you say so.
    const candRow = (m, i, c, n) =>
      `<label class="lo-disc-row"><input type="checkbox" data-dcand="${n}" data-dm="${i}" ${m.sel.has(n) ? 'checked' : ''}><span class="lo-disc-title">${h(c.name)}</span><span class="muted lo-disc-meta">${h(c.subtitle || '')}</span></label>`;
    // Every member is a checkbox list of what YouTube Music offered for the name. A confident match is shown on its own with
    // the other candidates tucked under "other matches" (opened when one of them is ticked); a doubtful one lists them all.
    const memberRows = d.members
      .map((m, i) => {
        if (!m.candidates.length) return `<div class="lo-disc-pickrow"><span class="lo-disc-pickname">${h(m.query)}</span><span class="muted">No artist found on YouTube Music — will be skipped</span></div>`;
        const shown = m.review || m.pick < 0 ? m.candidates.map((_, n) => n) : [m.pick];
        const rest = m.candidates.map((_, n) => n).filter((n) => !shown.includes(n));
        return `<div class="lo-disc-pickrow lo-disc-review"><span class="lo-disc-pickname">${h(m.query)}</span><div class="lo-disc-cands">${shown.map((n) => candRow(m, i, m.candidates[n], n)).join('')}${
          rest.length ? `<details ${rest.some((n) => m.sel.has(n)) ? 'open' : ''}><summary class="muted">${rest.length} other match${rest.length === 1 ? '' : 'es'}</summary>${rest.map((n) => candRow(m, i, m.candidates[n], n)).join('')}</details>` : ''
        }</div></div>`;
      })
      .join('');
    const reviewing = d.members.filter((m) => m.review).length;
    const matched = d.members.filter((m) => !m.review && m.pick >= 0).length;
    const ticked = d.members.reduce((n, m) => n + (m.sel ? m.sel.size : 0), 0);
    const artists = 1 + ticked;
    const lookedUp = d.lookup && d.lookup.status === 'done' && YTMO.utils.normalizeKey(d.lookup.query) === YTMO.utils.normalizeKey(d.artistQuery);
    return `<div class="lo-section lo-disc">
      ${stepper(h, 2)}
      <b>Artists found</b>
      <div class="muted lo-hint">${
        d.members.length
          ? `${matched} of ${d.members.length} members and units matched on YouTube Music${lookedUp ? ` (names from the lookup for “${h(d.artistQuery)}”)` : ''}. Untick any that look wrong — compare the audience numbers, since unrelated artists with the same name do show up.${reviewing ? ` ${reviewing} ${reviewing === 1 ? "wasn't an exact match, so it lists" : "weren't exact matches, so they list"} every candidate instead: tick whichever belong (e.g. “HxW” for “Hoshi X Woozi”) or none to leave ${reviewing === 1 ? 'it' : 'them'} out.` : ''}`
          : `Pick the right match — compare the audience numbers, since unrelated artists with the same name do show up (searching “Seventeen” also finds an Indonesian band).${d.franchise ? ' “Find songs” reads this artist’s releases again and lists the units and characters credited on them for you to tick.' : ''}`
      }</div>
      <div class="lo-disc-pickrow"><span class="lo-disc-pickname">${h(d.artistQuery)}</span>${candSelect(h, d.group.candidates, d.group.pick, 'g')}</div>
      ${memberRows}
      ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      <div class="lo-disc-actions">
        <button class="btn btn-primary" data-act="disc-collect">Find songs${artists > 1 ? ` for ${artists} artists` : ''}</button>
        ${d.members.some((m) => m.candidates.length) ? '<button class="btn btn-secondary" data-act="disc-cand-all">Tick every candidate</button><button class="btn btn-secondary" data-act="disc-cand-none">None</button>' : ''}
        <button class="btn btn-secondary" data-act="disc-back">Back</button>
      </div>
    </div>`;
  }

  function discoveredView(ctx) {
    const { h, state } = ctx;
    const d = state.disc;
    const isChar = YTMO.catalog.isCharacterCredit;
    const done = (c) => d.dxDone.has(c.browseId);
    const hasRoster = d.lookup && d.lookup.status === 'done' && YTMO.utils.normalizeKey(d.lookup.query) === YTMO.utils.normalizeKey(d.artistQuery);
    // Why an act is (un)ticked: its relation to the looked-up roster, or just "voice actor" when spotted from the credits.
    const KIND_TAG = { cast: 'on roster', member: 'on roster', unit: 'on roster', actor: 'voice actor — other work' };
    const kindTag = (c) => {
      const k = d.kinds.get(c.browseId);
      if (k) return `<span class="tag">${KIND_TAG[k]}</span>`;
      return hasRoster ? '<span class="tag">not on roster</span>' : '';
    };
    const meta = (c) => `${kindTag(c)}<span class="muted lo-disc-meta">${c.releases} release${c.releases === 1 ? '' : 's'}</span>`;
    const row = (c) =>
      done(c)
        ? `<div class="lo-disc-row have"><input type="checkbox" checked disabled><span class="lo-disc-title">${h(c.name)}</span><span class="tag">collected</span>${meta(c)}</div>`
        : `<label class="lo-disc-row"><input type="checkbox" data-dx="${h(c.browseId)}" ${d.dxPick.has(c.browseId) ? 'checked' : ''}><span class="lo-disc-title">${h(c.name)}</span>${meta(c)}</label>`;
    const sorted = [...d.discovered].sort((a, b) => b.releases - a.releases || a.name.localeCompare(b.name));
    const groups = sorted.filter((c) => !isChar(c.name));
    const chars = sorted.filter((c) => isChar(c.name));
    // The section header's checkbox ticks / unticks every act in it that isn't already collected.
    const section = (key, title, list) => {
      if (!list.length) return '';
      const open = list.filter((c) => !done(c));
      const all = open.length > 0 && open.every((c) => d.dxPick.has(c.browseId));
      return `<div class="lo-disc-grp"><input type="checkbox" data-dxsec="${key}" ${all ? 'checked' : ''} ${open.length ? '' : 'disabled'} title="Tick / untick every act in this section"><b>${title}</b><span class="muted">${list.length}</span></div>${list.map(row).join('')}`;
    };
    const ticked = d.discovered.filter((c) => d.dxPick.has(c.browseId) && !done(c)).length;
    // With a roster: credited acts it doesn't list (often a unit the article misses, like MEZZO") deserve a look; voice actors don't count.
    const offRoster = hasRoster ? d.discovered.filter((c) => !done(c) && !d.dxPick.has(c.browseId) && d.kinds.get(c.browseId) !== 'actor').length : 0;
    return `<div class="lo-disc">
      <div class="lo-disc-bar">
        ${stepper(h, 2)}
        <b>Artists found</b>
        ${offRoster ? `<div class="muted lo-hint"><b>Everything on the roster is ticked.</b> ${offRoster} other act${offRoster === 1 ? ' is' : 's are'} credited on these releases but ${offRoster === 1 ? "isn't" : "aren't"} on the Wikipedia roster — often a unit the article doesn't list. Tick any that belong; leave the rest unticked to skip them.</div>` : ''}
        <div class="muted lo-hint">${d.discovered.length} other act${d.discovered.length === 1 ? '' : 's'} credited on ${h(discGroupLabel(d))}'s releases (wrong artist? Back lets you pick another match). Tick the ones to find songs for — releases already read are skipped, so this mainly adds works the franchise page doesn't list (fusion units, solo releases). <b>Characters credited on anything collected are then followed automatically</b> (up to 150), which is how a franchise's whole cast turns up — most aren't credited on the franchise page itself. Non-character acts with a single release start unticked: they're often guests with unrelated catalogs.</div>
        <div class="lo-disc-actions">
          <button class="btn btn-primary" data-act="disc-expand" ${ticked ? '' : 'disabled'}>Find songs for ${ticked} more</button>
          <button class="btn btn-secondary" data-act="disc-skip-expand">Skip — show the songs found so far</button>
          <button class="btn btn-secondary" data-act="disc-x-units" title="Groups and units only, no characters">Groups only</button>
          <button class="btn btn-secondary" data-act="disc-x-all">All</button>
          <button class="btn btn-secondary" data-act="disc-x-none">None</button>
          <button class="btn btn-secondary" data-act="disc-back">Back</button>
        </div>
        ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      </div>
      <div class="lo-disc-list">
        ${section('units', 'Groups &amp; units', groups)}
        ${section('chars', 'Characters', chars)}
      </div>
    </div>`;
  }

  const discGroupLabel = (d) => (d.group && d.group.candidates[d.group.pick] ? d.group.candidates[d.group.pick].name : d.artistQuery);

  function progressView(ctx, title) {
    const { h, state } = ctx;
    const p = state.disc.progress || { done: 0, total: 0, label: '' };
    const pct = p.total ? Math.min(1, p.done / p.total) : null;
    return `<div class="lo-section lo-disc">
      ${stepper(h, p.step || 3)}
      <b>${h(p.title || title)}</b>
      <div class="muted lo-hint">${h(p.label || '')}${p.total ? ` · ${p.done} / ${p.total}` : ''}</div>
      <div class="lo-scanbar-track">${pct != null ? `<div style="width:${Math.round(pct * 100)}%"></div>` : '<div class="lo-scanbar-indeterminate"></div>'}</div>
      <div class="lo-disc-actions"><button class="btn btn-secondary" data-act="disc-cancel">Stop</button></div>
    </div>`;
  }

  function previewView(ctx) {
    const { h, state } = ctx;
    const d = state.disc;
    const groups = YTMO.catalog.groupByRelease(d.tracks);
    const onPlaylistPage = state.page === 'playlist';
    const target = onPlaylistPage ? d.target : 'new';
    const picked = d.tracks.filter((t) => d.picked.has(t.videoId)).length;
    const alt = d.tracks.filter((t) => t.alt).length;
    const have = d.tracks.filter((t) => t.inPlaylist).length;
    const s = d.summary || {};
    const groupName = d.group ? d.group.candidates[d.group.pick].name : '';
    // Hover text for an alternate-version tag: which copy of the song is the one ticked by default instead.
    const altTip = (t) => {
      const o = t.altOf;
      if (!o) return 'No full version of this song was found among the collected releases, so this alternate version is ticked in its place — untick it if you don\'t want it.';
      const where = [o.album, [o.releaseType, o.year].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
      return `Prioritised instead: “${o.title}”${where ? ' on ' + where : ''}${o.durationText ? ' (' + o.durationText + ')' : ''}. This copy is unticked by default.`;
    };
    // Only songs that came (also) from a member's page get a tag; the group's own songs are the default.
    const viaTag = (t) => {
      const others = (t.via || []).filter((v) => v !== groupName);
      return others.length ? `<span class="tag">${h(others.join(' + '))}</span>` : '';
    };
    const notes = [
      `${d.tracks.length} songs from ${groups.length} release${groups.length === 1 ? '' : 's'}`,
      alt ? `${alt} alternate version${alt === 1 ? '' : 's'} / duplicates` : '',
      target === 'current' && have ? `${have} already in this playlist` : '',
      s.followed ? `${s.followed} more character${s.followed === 1 ? '' : 's'} followed automatically` : '',
      s.roster ? `roster from ${s.roster}` : '',
      d.autoNote && d.autoNote.skipped.length
        ? `${d.autoNote.skipped.length} of ${d.autoNote.total} members not matched on YouTube Music (${d.autoNote.skipped.slice(0, 6).join(', ')}${d.autoNote.skipped.length > 6 ? '…' : ''}) — Back to pick them by hand`
        : '',
      s.skippedActs ? `${s.skippedActs} other credited act${s.skippedActs === 1 ? '' : 's'} skipped (not on the roster) — Back to review them` : '',
      s.failedReleases ? `${s.failedReleases} release${s.failedReleases === 1 ? '' : 's'} couldn't be read` : '',
    ].filter(Boolean);

    const targetCtl = `<div class="lo-disc-target">
      ${
        onPlaylistPage
          ? `<select class="input lo-disc-sel" data-in="disc-target"><option value="current" ${target === 'current' ? 'selected' : ''}>Add to this playlist${state.header.title ? ` (${h(state.header.title)})` : ''}</option><option value="new" ${target === 'new' ? 'selected' : ''}>Create a new playlist…</option></select>`
          : '<span class="muted">Will create a new private playlist</span>'
      }
      ${target === 'new' ? `<input type="text" class="input lo-disc-input" data-in="disc-newname" placeholder="New playlist name" value="${h(d.newName)}">` : ''}
    </div>`;

    const rows = groups
      .map((g) => {
        const all = g.tracks.every((t) => d.picked.has(t.videoId));
        return `<div class="lo-disc-grp"><input type="checkbox" data-dgrp="${h(g.key)}" ${all ? 'checked' : ''}><b>${h(g.title)}</b><span class="muted">${h([g.type, g.year].filter(Boolean).join(' · '))} · ${g.tracks.length}</span></div>
        ${g.tracks
          .map(
            (t) => `<label class="lo-disc-row ${t.alt ? 'alt' : ''} ${t.inPlaylist && target === 'current' ? 'have' : ''}">
            <input type="checkbox" data-dsel="${h(t.videoId)}" ${d.picked.has(t.videoId) ? 'checked' : ''}>
            <span class="lo-disc-title">${h(t.title)}</span>
            <span class="muted lo-disc-meta">${h(names(t))}</span>
            ${t.altReason ? `<span class="tag" title="${h(altTip(t))}">${h(t.altReason)}</span>` : ''}
            ${t.inPlaylist && target === 'current' ? '<span class="tag">in playlist</span>' : ''}
            ${viaTag(t)}
            <span class="num">${h(t.durationText || '')}</span>
          </label>`
          )
          .join('')}`;
      })
      .join('');

    return `<div class="lo-disc">
      <div class="lo-disc-bar">
        ${stepper(h, 4)}
        <b>Songs found</b>
        <div class="lo-disc-summary">${notes.map(h).join(' · ')}</div>
        ${targetCtl}
        <div class="lo-disc-actions">
          <button class="btn btn-primary" data-act="disc-add" ${picked ? '' : 'disabled'}>Add ${picked} song${picked === 1 ? '' : 's'} to playlist</button>
          <button class="btn btn-secondary" data-act="disc-originals" title="Select every song except alternate versions and duplicates">Originals only</button>
          <button class="btn btn-secondary" data-act="disc-all">All</button>
          <button class="btn btn-secondary" data-act="disc-none">None</button>
          <button class="btn btn-secondary" data-act="disc-back">Back</button>
        </div>
        ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      </div>
      <div class="lo-disc-list">${rows || '<div class="empty muted">No songs found for that selection.</div>'}</div>
    </div>`;
  }

  function doneView(ctx) {
    const { h, state } = ctx;
    const r = state.disc.result;
    if (!r) return '';
    const url = `https://music.youtube.com/playlist?list=${encodeURIComponent(r.playlistId)}`;
    return `<div class="lo-section lo-disc">
      ${stepper(h, 5)}
      <b>${r.cancelled ? 'Stopped' : 'Done'}</b>
      <div class="lo-hint">${r.added} added${r.skipped ? `, ${r.skipped} already there (skipped)` : ''}${r.failed.length ? `, ${r.failed.length} failed` : ''} of ${r.requested} requested.</div>
      <div class="muted lo-hint">${
        r.created
          ? `Created the private playlist “${h(r.name)}”.`
          : 'Reload this page to see the new songs, then Rescan the Tracks tab.'
      }</div>
      <div class="lo-disc-actions">
        ${r.created ? `<a class="btn btn-primary" href="${h(url)}" target="_blank" rel="noopener">Open playlist</a>` : ''}
        <button class="btn btn-secondary" data-act="disc-back">Add more</button>
      </div>
    </div>`;
  }

  function discoverBody(ctx) {
    const d = ctx.state.disc;
    switch (d.phase) {
      case 'searching':
        return setupForm(ctx, true);
      case 'resolved':
        return confirmView(ctx);
      case 'collecting':
        return progressView(ctx, 'Collecting songs…');
      case 'discovered':
        return discoveredView(ctx);
      case 'preview':
        return previewView(ctx);
      case 'adding':
        return progressView(ctx, 'Adding songs…');
      case 'done':
        return doneView(ctx);
      default:
        return setupForm(ctx, false);
    }
  }

  YTMO.layoutShared = YTMO.layoutShared || {};
  YTMO.layoutShared.discoverBody = discoverBody;
})();
