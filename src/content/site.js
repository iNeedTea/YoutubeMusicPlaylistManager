/* global window, location */
// Picks the active per-service adapter. Loaded after ytm-dom.js and
// spotify-dom.js, before automation.js/panel.js/content.js, so everything
// downstream can just use YTMO.dom / YTMO.site without knowing which site it's on.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});
  const isSpotify = /(^|\.)open\.spotify\.com$/.test(location.hostname);
  const name = isSpotify ? 'spotify' : 'ytm';
  YTMO.site = { name, isYTM: name === 'ytm', isSpotify: name === 'spotify' };
  YTMO.dom = isSpotify ? YTMO.spotifyDom : YTMO.ytmDom;
  /** Playlist-scoped storage keys are namespaced per service to keep the two apart. */
  YTMO.site.metaKey = (playlistId) => (name === 'ytm' ? playlistId : `${name}:${playlistId}`);
})();
