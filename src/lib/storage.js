/* global chrome, window */
// Thin wrapper over chrome.storage.local shared by the content script and popup.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  const DEFAULT_SETTINGS = {
    // Delay between automation steps (menu open -> click item -> dialog). Raise if a site feels laggy.
    stepDelay: 600,
    // Panel starts open on playlist pages
    autoOpen: false,
    // Duplicate matching: also collapse remixes/alternate versions, and feat./collab variants
    dupeVersions: false,
    dupeCollabs: false,
    // Per-service fallback text patterns, used only when a menu item can't be
    // recognised by icon/structure (see each site adapter for what's verified).
    ytm: {
      labelRemove: 'remove from playlist',
      labelSave: 'save to playlist|add to playlist',
    },
    spotify: {
      labelAdd: 'add to playlist',
      labelRemove: 'remove from this playlist|remove from playlist',
    },
  };

  const AVAILABLE_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#00acc1', '#757575'];

  function get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  /** Merge saved settings onto the defaults, migrating the pre-0.3 flat labelRemove/labelSave (YTM-only) into settings.ytm.*. */
  async function getSettings() {
    const { settings } = await get('settings');
    const saved = settings || {};
    const merged = {
      ...DEFAULT_SETTINGS,
      ...saved,
      ytm: { ...DEFAULT_SETTINGS.ytm, ...(saved.ytm || {}) },
      spotify: { ...DEFAULT_SETTINGS.spotify, ...(saved.spotify || {}) },
    };
    if (saved.labelRemove && !saved.ytm) merged.ytm.labelRemove = saved.labelRemove;
    if (saved.labelSave && !saved.ytm) merged.ytm.labelSave = saved.labelSave;
    delete merged.labelRemove;
    delete merged.labelSave;
    return merged;
  }

  /** `patch` may include nested `ytm`/`spotify` partial objects; they're merged, not replaced. */
  async function saveSettings(patch) {
    const current = await getSettings();
    const next = {
      ...current,
      ...patch,
      ytm: { ...current.ytm, ...(patch.ytm || {}) },
      spotify: { ...current.spotify, ...(patch.spotify || {}) },
    };
    await set({ settings: next });
    return next;
  }

  /** playlistMeta: { [playlistId]: { title, tags: string[], note: string, color: string|null, updatedAt } } */
  async function getAllMeta() {
    const { playlistMeta } = await get('playlistMeta');
    return playlistMeta || {};
  }

  async function getMeta(playlistId) {
    const all = await getAllMeta();
    return all[playlistId] || { title: '', tags: [], note: '', color: null };
  }

  async function saveMeta(playlistId, patch) {
    const all = await getAllMeta();
    const prev = all[playlistId] || { title: '', tags: [], note: '', color: null };
    const next = { ...prev, ...patch, updatedAt: Date.now() };
    const empty = !next.tags?.length && !next.note && !next.color;
    if (empty) delete all[playlistId];
    else all[playlistId] = next;
    await set({ playlistMeta: all });
    return next;
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') cb(changes);
    });
  }

  YTMO.storage = {
    DEFAULT_SETTINGS,
    AVAILABLE_COLORS,
    get,
    set,
    getSettings,
    saveSettings,
    getAllMeta,
    getMeta,
    saveMeta,
    onChange,
  };
})();
