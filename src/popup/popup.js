/* global chrome, window, document */
(function () {
  const { storage, utils } = window.YTMO;
  const $ = (id) => document.getElementById(id);

  const SITE_URL = { ytm: (id) => `https://music.youtube.com/playlist?list=${encodeURIComponent(id)}`, spotify: (id) => `https://open.spotify.com/playlist/${encodeURIComponent(id)}` };
  const SITE_LABEL = { ytm: 'YTM', spotify: 'Spotify' };

  /** Meta keys are the bare YTM playlist id, or "spotify:<id>" — see YTMO.site.metaKey in site.js. */
  function splitKey(key) {
    if (key.startsWith('spotify:')) return { service: 'spotify', id: key.slice('spotify:'.length) };
    return { service: 'ytm', id: key };
  }

  async function renderPlaylists() {
    const meta = await storage.getAllMeta();
    const entries = Object.entries(meta).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    $('count').textContent = entries.length;
    $('none').hidden = entries.length > 0;
    utils.setHTML(
      $('playlists'),
      entries
        .map(([key, m]) => {
          const { service, id } = splitKey(key);
          return `<li>
          <i style="${m.color ? 'background:' + utils.escapeHtml(m.color) : ''}"></i>
          <span class="svc">${SITE_LABEL[service]}</span>
          <a href="${SITE_URL[service](id)}" target="_blank" title="${utils.escapeHtml(m.note || '')}">${utils.escapeHtml(m.title || id)}</a>
          ${(m.tags || []).map((t) => `<span class="tag">${utils.escapeHtml(t)}</span>`).join('')}
        </li>`;
        })
        .join('')
    );
  }

  async function loadSettings() {
    const s = await storage.getSettings();
    $('stepDelay').value = s.stepDelay;
    $('autoOpen').checked = !!s.autoOpen;
    $('ytmLabelRemove').value = s.ytm.labelRemove;
    $('ytmLabelSave').value = s.ytm.labelSave;
    $('spotifyLabelAdd').value = s.spotify.labelAdd;
    $('spotifyLabelRemove').value = s.spotify.labelRemove;
  }

  $('save').addEventListener('click', async () => {
    const regexFields = ['ytmLabelRemove', 'ytmLabelSave', 'spotifyLabelAdd', 'spotifyLabelRemove'];
    for (const id of regexFields) {
      try {
        new RegExp($(id).value, 'i');
      } catch (e) {
        alert(`Invalid regex in "${id}": ${e.message}`);
        return;
      }
    }
    const d = storage.DEFAULT_SETTINGS;
    await storage.saveSettings({
      stepDelay: Math.max(200, parseInt($('stepDelay').value, 10) || d.stepDelay),
      autoOpen: $('autoOpen').checked,
      ytm: {
        labelRemove: $('ytmLabelRemove').value.trim() || d.ytm.labelRemove,
        labelSave: $('ytmLabelSave').value.trim() || d.ytm.labelSave,
      },
      spotify: {
        labelAdd: $('spotifyLabelAdd').value.trim() || d.spotify.labelAdd,
        labelRemove: $('spotifyLabelRemove').value.trim() || d.spotify.labelRemove,
      },
    });
    $('saved').hidden = false;
    setTimeout(() => ($('saved').hidden = true), 1500);
  });

  $('open-ytm').addEventListener('click', () => chrome.tabs.create({ url: 'https://music.youtube.com/library/playlists' }));
  $('open-spotify').addEventListener('click', () => chrome.tabs.create({ url: 'https://open.spotify.com/collection/playlists' }));

  $('export').addEventListener('click', async () => {
    const meta = await storage.getAllMeta();
    utils.download('playlist-organizer-tags.json', JSON.stringify({ playlistMeta: meta, exportedAt: new Date().toISOString() }, null, 2), 'application/json');
  });

  $('import').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.playlistMeta || data;
      if (typeof incoming !== 'object') throw new Error('Unexpected file format');
      const current = await storage.getAllMeta();
      let n = 0;
      for (const [id, m] of Object.entries(incoming)) {
        if (!m || typeof m !== 'object') continue;
        const prev = current[id] || { tags: [], note: '', color: null };
        current[id] = {
          title: m.title || prev.title || '',
          tags: [...new Set([...(prev.tags || []), ...(m.tags || [])])],
          note: m.note || prev.note || '',
          color: m.color || prev.color || null,
          updatedAt: Date.now(),
        };
        n++;
      }
      await storage.set({ playlistMeta: current });
      await renderPlaylists();
      alert(`Imported ${n} playlist(s).`);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  });

  storage.onChange(renderPlaylists);
  renderPlaylists();
  loadSettings();
})();
