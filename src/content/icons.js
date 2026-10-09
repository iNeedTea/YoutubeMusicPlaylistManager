/* global window */
// A small local icon set in Phosphor's "regular" visual language (24x24,
// 1.5px stroke, round caps/joins, currentColor) instead of loading the actual
// Phosphor webfont. Two reasons: both host pages (music.youtube.com and
// open.spotify.com) enforce their own CSPs that have already blocked other
// unrelated cross-origin loads this extension tried (see ytm-dom.js /
// spotify-dom.js history), so a remote font is a real, silent-failure risk;
// and pulling in the whole Phosphor font for ~18 glyphs is wasteful. Icons are
// inline SVG strings, sized by the wrapping element's font-size via `1em`, and
// coloured by `currentColor`, so normal CSS controls them like a real icon
// font would. The two "service" glyphs are generic marks (a play-triangle,
// a soundwave) — not the actual YouTube/Spotify logomarks.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  const S = 'width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  const ICONS = {
    'paint-brush-broad':
      '<path d="M4 16.5c0-3 2.2-5 5-5.5l7-6.5a2 2 0 0 1 2.8 2.8l-6.5 7c-.5 2.8-2.5 5-5.5 5-1 0-1.5-.5-1.5-1 0-.7.5-1 1-1.3.6-.3 1-1 .5-1.7-.5-.7-1.6-.6-2.3.2-.4.4-.7 1-.9 1.6-.2.5-.6.8-1 .8-.5 0-1-.4-.9-1.1.1-.8.4-1.6.9-2.3Z"/>',
    'magnifying-glass': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3"/>',
    'musical-notes': '<path d="M9 17.5V6l10-2v9.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="13.5" r="2.5"/>',
    waveform: '<path d="M3 12v1M7 8v9M11 4v17M15 8v9M19 6v13M21 11v3"/>',
    tag: '<path d="M11.5 4H6a2 2 0 0 0-2 2v5.5a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l5-5a2 2 0 0 0 0-2.8l-8-8a2 2 0 0 0-1.4-.6Z"/><circle cx="8.2" cy="8.2" r="1.2"/>',
    'bookmark-simple': '<path d="M6 4h12v16l-6-4-6 4Z"/>',
    'chart-bar': '<path d="M4 20V10M10 20V4M16 20v-7M4 20h16"/>',
    'arrows-clockwise': '<path d="M4 12a8 8 0 0 1 13.9-5.4M20 12a8 8 0 0 1-13.9 5.4"/><path d="M17.5 3.5v3.6h-3.6M6.5 20.5v-3.6h3.6"/>',
    'download-simple': '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5"/><path d="M5 18.5h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
    funnel: '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
    'caret-down': '<path d="M6 9l6 6 6-6"/>',
    'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
    'warning-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.4"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none"/>',
    stack: '<path d="M12 3.5 4 8l8 4.5 8-4.5Z"/><path d="M4 12l8 4.5 8-4.5M4 16l8 4.5 8-4.5"/>',
    'dots-three-vertical': '<circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/>',
    'list-magnifying-glass': '<path d="M4 6h9M4 12h5"/><circle cx="14.5" cy="15.5" r="4"/><path d="M20 21l-2.6-2.6"/>',
    'command-bar': '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M9 9v.01M9 15v-.01M8 9h1v6M15 9h1.2a1.8 1.8 0 1 1 0 3.6H15m0-3.6v6.4"/>',
    'dots-six-vertical':
      '<circle cx="9" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.3" fill="currentColor" stroke="none"/>',
  };

  /** Raw `<svg>...</svg>` markup for `name`, or an empty string if unknown. */
  function svg(name, extraAttrs) {
    const body = ICONS[name];
    if (!body) return '';
    return `<svg ${S}${extraAttrs ? ' ' + extraAttrs : ''}>${body}</svg>`;
  }

  YTMO.icons = { svg, names: Object.keys(ICONS) };
})();
