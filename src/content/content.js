/* global window, document */
// Entry point: boots the panel and decorates YTM's own pages (row highlight,
// colour/tag badges on library cards).
(function () {
  const YTMO = window.YTMO;
  const { escapeHtml: h, setHTML } = YTMO.utils;

  // Styles applied to the host site's own DOM (outside the shadow panel). A plain
  // class selector (not tag-scoped) so the "scroll to this row" highlight works
  // on both YTM's and Spotify's row elements.
  const style = document.createElement('style');
  style.textContent = `
    .ytmo-flash { outline: 2px solid #3ea6ff !important; outline-offset: -2px; background: rgba(62,166,255,.12) !important; transition: background .6s; }
    .ytmo-badge { display: inline-flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; color: #aaa; }
    .ytmo-badge i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .ytmo-badge b { font-weight: 400; background: rgba(255,255,255,.12); border-radius: 8px; padding: 0 6px; }
  `;
  document.documentElement.appendChild(style);

  async function decorateLibrary() {
    if (!YTMO.dom.capabilities.libraryPage || YTMO.dom.getPageType() !== 'library') return;
    const meta = await YTMO.storage.getAllMeta();
    for (const p of YTMO.dom.getLibraryPlaylists()) {
      const m = meta[p.id];
      const existing = p.el.querySelector('.ytmo-badge');
      if (!m || (!m.color && !m.tags?.length)) {
        existing?.remove();
        continue;
      }
      const html = `${m.color ? `<i style="background:${h(m.color)}"></i>` : ''}${(m.tags || []).map((t) => `<b>${h(t)}</b>`).join('')}`;
      if (existing) {
        if (existing.innerHTML !== html) setHTML(existing, html);
        continue;
      }
      const badge = document.createElement('div');
      badge.className = 'ytmo-badge';
      setHTML(badge, html);
      const anchor = p.el.querySelector('.subtitle, .details, .title');
      (anchor?.parentElement || p.el).appendChild(badge);
    }
  }

  YTMO.panel.init().then(() => {
    decorateLibrary();
    YTMO.utils.every(decorateLibrary, 2500);
    YTMO.storage.onChange(() => decorateLibrary());
  });
})();
