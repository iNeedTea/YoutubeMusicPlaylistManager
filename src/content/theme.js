/* global window, chrome, document */
// Theme store + applier for the Organizer panel. Ported from the provided
// theme.js (an ES module) into this codebase's plain-script / window.YTMO
// pattern, since content scripts here load as classic scripts sharing one
// global namespace, not modules. Logic and public API are unchanged: same
// LAYOUTS/SCHEMES/DEFAULTS shape, same Theme.load/save/apply/subscribe/reset,
// same wirePicker/initTheme contract. Uses chrome.storage.sync so a theme
// choice follows the user across machines; the extension's "storage"
// permission already covers both storage.sync and storage.local.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  const KEY = 'organizerTheme';

  const LAYOUTS = [
    { id: 'classic', name: 'Classic tabs', note: 'Closest to today' },
    { id: 'rail', name: 'Status rail', note: 'Counts always on' },
    { id: 'console', name: 'Console', note: 'Dense + scan log' },
    { id: 'spine', name: 'Spine', note: 'Timeline + merge stacks' },
  ];

  const SCHEMES = [
    { id: 'steel', name: 'Steel', sub: 'Default', bg: '#171a20', surface: '#23262e', accent: '#7f8aa6' },
    { id: 'verdigris', name: 'Verdigris', sub: 'Cool green', bg: '#141c1e', surface: '#1f2a2c', accent: '#35a89c' },
    { id: 'ember', name: 'Ember', sub: 'Warm ground', bg: '#1d1719', surface: '#2b2325', accent: '#d07a5f' },
    { id: 'mist', name: 'Mist', sub: 'Light · cool', bg: '#f2f4f7', surface: '#e3e7ee', accent: '#3f6fa8' },
    { id: 'linen', name: 'Linen', sub: 'Light · warm', bg: '#f8f4ed', surface: '#ece5d9', accent: '#a8663f' },
  ];

  const DEFAULTS = { layout: 'classic', scheme: 'steel', density: 'thumbs', glow: 'on' };

  function valid(s) {
    return {
      layout: LAYOUTS.some((l) => l.id === s?.layout) ? s.layout : DEFAULTS.layout,
      scheme: SCHEMES.some((c) => c.id === s?.scheme) ? s.scheme : DEFAULTS.scheme,
      density: ['compact', 'thumbs', 'roomy'].includes(s?.density) ? s.density : DEFAULTS.density,
      glow: s?.glow === 'off' ? 'off' : 'on',
    };
  }

  async function load() {
    try {
      const got = await new Promise((resolve, reject) => {
        chrome.storage.sync.get(KEY, (res) => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(res)));
      });
      return valid(got?.[KEY]);
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  async function save(state) {
    const next = valid(state);
    try {
      await new Promise((resolve) => chrome.storage.sync.set({ [KEY]: next }, resolve));
    } catch (e) {
      /* best-effort; the in-memory state already reflects the choice */
    }
    return next;
  }

  function apply(root, state) {
    const s = valid(state);
    root.classList.add('organizer-panel');
    root.dataset.layout = s.layout;
    root.dataset.scheme = s.scheme;
    root.dataset.density = s.density;
    root.dataset.glow = s.glow;
    return s;
  }

  /** Fires when another tab or device changes the theme. Returns an unsubscribe fn. */
  function subscribe(fn) {
    const handler = (changes, area) => {
      if ((area === 'sync' || area === 'local') && changes[KEY]) fn(valid(changes[KEY].newValue));
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  async function reset() {
    return save(DEFAULTS);
  }

  const Theme = { load, save, apply, subscribe, reset };

  /**
   * Optimistic picker wiring. Call once after rendering the Theme tab. Expects
   * elements carrying data-pick="layout|scheme|density|glow" and data-value="<id>"
   * within `root` (the same root Theme.apply() was called on, or an ancestor of it).
   */
  function wirePicker(root, state, onChange) {
    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-pick][data-value]');
      if (!el) return;
      const next = { ...state, [el.dataset.pick]: el.dataset.value };
      Object.assign(state, Theme.apply(root.classList.contains('organizer-panel') ? root : root.querySelector('.organizer-panel'), next));
      if (onChange) onChange(state); // re-render the picker's selected states
      await Theme.save(state); // persist after the UI has already moved
    });
  }

  /** Bootstrap: load the saved theme, apply it to `root`, and keep it in sync across tabs. */
  async function initTheme(root) {
    const state = Theme.apply(root, await Theme.load());
    Theme.subscribe((next) => Theme.apply(root, next));
    return state;
  }

  YTMO.theme = { LAYOUTS, SCHEMES, DEFAULTS, Theme, wirePicker, initTheme };
})();
