/* global window */
// Body of the "Add music" tab (YTM only) — one implementation shared by all four layouts,
// like the Stats / Tags / Theme bodies in layout-shared.js. Pure markup: every control is
// wired by data-* attributes that panel.js's delegated click/input handlers pick up
// (data-act="disc-*", data-dsel, data-dgrp, data-dopt, data-in="disc-*").
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  const names = (t) => (t.artists && t.artists.length ? t.artists.join(', ') : '');

  function setupForm(ctx, busy) {
    const { h, state } = ctx;
    const d = state.disc;
    const members = d.includeSolo
      ? `<textarea class="input lo-textarea lo-disc-input" rows="2" data-in="disc-members" placeholder="Member / sub-unit names, comma-separated — e.g. S.Coups, Jeonghan, Joshua, Jun, Hoshi, Wonwoo, Woozi, DK, Mingyu, The8, Seungkwan, Vernon, Dino, BSS, JxW">${h(d.memberText)}</textarea>
         <div class="muted lo-hint">Each name is looked up as an artist, and you confirm the match before anything is collected — common names (Joshua, Jun…) often match the wrong person. A member's list includes songs they're only credited on as a collaborator or feature. Sub-units (e.g. BSS) have their own artist pages, so add them here too.</div>`
      : '';
    return `<div class="lo-section lo-disc">
      <b>Add music by artist</b>
      <div class="muted lo-hint">Collects every song YouTube Music lists for an artist — all albums, singles and EPs plus their song list — so you can review it before anything is added. Uses YouTube Music's own catalog, so only real songs appear; some very old or region-locked releases may be missing.</div>
      <input type="text" class="input lo-disc-input" data-in="disc-artist" placeholder="Artist or group (e.g. Seventeen)" value="${h(d.artistQuery)}" ${busy ? 'disabled' : ''}>
      <label class="lo-disc-check"><input type="checkbox" data-dopt="includeSolo" ${d.includeSolo ? 'checked' : ''}> Include solo artists' work (members and sub-units)</label>
      ${members}
      <label class="lo-disc-check"><input type="checkbox" data-dopt="franchise" ${d.franchise ? 'checked' : ''}> Franchise mode — also collect every unit and character credited on its releases</label>
      ${d.franchise ? '<div class="muted lo-hint">For a game/anime franchise (e.g. Ensemble Stars!!, IDOLiSH7) search the franchise\'s own artist page. After reading it you\'ll see every group and character credited on its releases, and can tick which of them to collect in full too — that catches solo character songs and unit releases the franchise page doesn\'t list.</div>' : ''}
      <label class="lo-disc-check"><input type="checkbox" data-dopt="includeAlt" ${d.includeAlt ? 'checked' : ''}> Include alternate versions (instrumentals, remixes, other-language versions)</label>
      ${lookupRow(ctx, busy)}
      ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      <div class="lo-disc-actions"><button class="btn btn-secondary" data-act="disc-search" ${busy ? 'disabled' : ''} title="Search YouTube Music for this artist only — no online lookup, you confirm each match yourself">${busy ? 'Searching…' : 'Find artist only'}</button></div>
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
        d.franchise ? 'Only acts matching this list will be ticked and followed automatically; everything else is listed unticked.' : 'The names were filled into the member box above — edit them if needed.'
      }</div>`;
    }
    return `<div class="lo-disc-lookup">
      <button class="btn btn-primary" data-act="disc-lookup" ${busy || (l && l.status === 'loading') ? 'disabled' : ''}>Look up members &amp; find all music</button>
      <div class="muted lo-hint">One click: reads the real member / character list from Wikipedia and MusicBrainz (this sends the name typed above to them — nothing is sent unless you click), finds each member, unit and character on YouTube Music, and collects their songs, leaving out voice actors' and other artists' unrelated work. You review everything in a preview before anything is added. ${d.franchise ? '' : 'For a group, its members and sub-units are included automatically.'}</div>
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
    const reviewRow = (m, i) => `<div class="lo-disc-pickrow lo-disc-review"><span class="lo-disc-pickname">${h(m.query)}</span><div class="lo-disc-cands">${m.candidates
      .map((c, n) => `<label class="lo-disc-row"><input type="checkbox" data-dcand="${n}" data-dm="${i}" ${m.sel.has(n) ? 'checked' : ''}><span class="lo-disc-title">${h(c.name)}</span><span class="muted lo-disc-meta">${h(c.subtitle || '')}</span></label>`)
      .join('')}</div></div>`;
    const memberRows = d.members
      .map((m, i) =>
        m.review
          ? reviewRow(m, i)
          : d.reviewOnly
            ? ''
            : `<div class="lo-disc-pickrow"><span class="lo-disc-pickname">${h(m.query)}</span>${
                m.candidates.length ? candSelect(h, m.candidates, m.pick, String(i)) : '<span class="muted">No artist found — will be skipped</span>'
              }</div>`
      )
      .join('');
    if (d.reviewOnly) {
      const matched = d.members.filter((m) => !m.review && m.pick >= 0).length;
      const unfound = d.members.filter((m) => !m.review && m.pick < 0).map((m) => m.query);
      const ticked = d.members.reduce((n, m) => n + (m.sel ? m.sel.size : 0), 0);
      return `<div class="lo-section lo-disc">
        <b>${d.members.filter((m) => m.review).length} to check before collecting</b>
        <div class="muted lo-hint">${matched} of ${d.members.length} members and units were matched on YouTube Music automatically${d.artistQuery ? ` (roster from the lookup for “${h(d.artistQuery)}”)` : ''}. These weren't an exact match, so nothing is guessed: tick whichever candidates belong (e.g. “HxW” for “Hoshi X Woozi”, or “CxM (SEVENTEEN)” for “S.Coups X Mingyu”) — or none to leave them out.${unfound.length ? ` No YouTube Music artist at all for: ${h(unfound.join(', '))}.` : ''}</div>
        <div class="lo-disc-actions">
          <button class="btn btn-primary" data-act="disc-collect">${ticked ? `Collect with ${ticked} ticked` : 'Collect without them'}</button>
          <button class="btn btn-secondary" data-act="disc-cand-all">Tick every candidate</button>
          <button class="btn btn-secondary" data-act="disc-cand-none">None</button>
          <button class="btn btn-secondary" data-act="disc-back">Back</button>
        </div>
        ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
        ${memberRows}
      </div>`;
    }
    return `<div class="lo-section lo-disc">
      <b>Confirm the artists</b>
      <div class="muted lo-hint">Pick the right match for each. Compare the audience numbers — the real one is usually the biggest, and unrelated artists with the same name do show up (searching “Seventeen” also finds an Indonesian band).</div>
      <div class="lo-disc-pickrow"><span class="lo-disc-pickname">${h(d.artistQuery)}</span>${candSelect(h, d.group.candidates, d.group.pick, 'g')}</div>
      ${memberRows}
      ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      <div class="lo-disc-actions">
        <button class="btn btn-primary" data-act="disc-collect">Find songs</button>
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
    const ticked = d.discovered.filter((c) => d.dxPick.has(c.browseId) && !done(c)).length;
    return `<div class="lo-disc">
      <div class="lo-disc-bar">
        <b>${d.autoPause ? `${d.autoPause} credited act${d.autoPause === 1 ? '' : 's'} to check` : 'Units and characters found'}</b>
        ${d.autoPause ? `<div class="muted lo-hint"><b>Everything on the roster is already ticked and goes ahead.</b> ${d.autoPause} other act${d.autoPause === 1 ? ' is' : 's are'} credited on these releases but ${d.autoPause === 1 ? "isn't" : "aren't"} on the Wikipedia roster — often a unit the article doesn't list. Tick any that belong, then collect; leave the rest unticked to skip them.</div>` : ''}
        <div class="muted lo-hint">${d.discovered.length} other act${d.discovered.length === 1 ? '' : 's'} credited on ${h(discGroupLabel(d))}'s releases. Tick the ones to collect in full — releases already read are skipped, so this mainly adds works the franchise page doesn't list (fusion units, solo releases). <b>Characters credited on anything collected are then followed automatically</b> (up to 150), which is how a franchise's whole cast turns up — most aren't credited on the franchise page itself. Non-character acts with a single release start unticked: they're often guests with unrelated catalogs.</div>
        <div class="lo-disc-actions">
          <button class="btn btn-primary" data-act="disc-expand" ${ticked ? '' : 'disabled'}>Collect ${ticked} more</button>
          <button class="btn btn-secondary" data-act="disc-skip-expand">Skip — use what's been read</button>
          <button class="btn btn-secondary" data-act="disc-x-units" title="Groups and units only, no characters">Groups only</button>
          <button class="btn btn-secondary" data-act="disc-x-all">All</button>
          <button class="btn btn-secondary" data-act="disc-x-none">None</button>
          <button class="btn btn-secondary" data-act="disc-back">Back</button>
        </div>
        ${d.error ? `<div class="lo-disc-error">${h(d.error)}</div>` : ''}
      </div>
      <div class="lo-disc-list">
        ${groups.length ? `<div class="lo-disc-grp"><b>Groups &amp; units</b><span class="muted">${groups.length}</span></div>${groups.map(row).join('')}` : ''}
        ${chars.length ? `<div class="lo-disc-grp"><b>Characters</b><span class="muted">${chars.length}</span></div>${chars.map(row).join('')}` : ''}
      </div>
    </div>`;
  }

  const discGroupLabel = (d) => (d.group && d.group.candidates[d.group.pick] ? d.group.candidates[d.group.pick].name : d.artistQuery);

  function progressView(ctx, title) {
    const { h, state } = ctx;
    const p = state.disc.progress || { done: 0, total: 0, label: '' };
    const pct = p.total ? Math.min(1, p.done / p.total) : null;
    return `<div class="lo-section lo-disc">
      <b>${h(title)}</b>
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
            ${t.alt ? `<span class="tag">${h(t.altReason)}</span>` : ''}
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
        <div class="lo-disc-summary">${notes.map(h).join(' · ')}</div>
        ${targetCtl}
        <div class="lo-disc-actions">
          <button class="btn btn-primary" data-act="disc-add" ${picked ? '' : 'disabled'}>Add ${picked} song${picked === 1 ? '' : 's'}</button>
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
