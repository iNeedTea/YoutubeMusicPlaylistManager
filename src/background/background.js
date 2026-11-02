/* global chrome */
// Content scripts run in an "isolated world": they share the page's DOM but not its JS
// realm, so they can't see methods/properties a page's own script attaches to elements
// (e.g. YTM's Polymer `row.getSetVideoId()` — confirmed live: reading it from a content
// script always comes back undefined, even though the exact same call from the page's own
// console works fine). `chrome.scripting.executeScript` with `world: 'MAIN'` is the
// documented way to run code in the page's real JS context instead, bypassing that
// isolation (and the page's CSP, since it's not a `<script>` tag). Only the background
// service worker can call it; content scripts relay through here via messages.
// Panel stylesheets. A content script that fetch()es chrome-extension:// URLs does it as the *page* (music.youtube.com),
// and when the browser refuses (extension reloaded/updating under the tab, prerender, restored tab…) it logs "Unsafe attempt
// to load URL chrome-extension://…/theme.css from frame with URL https://music.youtube.com/…" itself — into the extension's
// Errors list — before any try/catch can see it. Reading the files here, in the extension's own origin, can't hit that.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'YTMO_GET_CSS') return;
  Promise.all(['src/content/theme.css', 'src/content/panel.css'].map((p) => fetch(chrome.runtime.getURL(p), { cache: 'no-store' }).then((r) => r.text())))
    .then((css) => sendResponse({ ok: true, css }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

// Member / cast lookup for the Add music tab. The requests (Wikipedia, MusicBrainz) are made here, not in the page,
// because host_permissions let the service worker call those sites while a content script is bound by the page's CORS.
importScripts('../lib/roster.js');
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'YTMO_LOOKUP') return;
  self.YTMO.roster
    .lookup(msg.query)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'YTMO_GET_SET_VIDEO_IDS') return;
  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: 'No sender tab' });
    return;
  }
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const rows = Array.from(document.querySelectorAll('ytmusic-playlist-shelf-renderer ytmusic-responsive-list-item-renderer'));
        return rows.map((r) => (typeof r.getSetVideoId === 'function' ? r.getSetVideoId() || '' : ''));
      },
    })
    .then((results) => sendResponse({ ok: true, ids: (results && results[0] && results[0].result) || [] }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // keep the message channel open for the async sendResponse above
});
