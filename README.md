# Playlist Organizer

A Chrome extension (Manifest V3) that adds an organizer side panel to playlists on
[YouTube Music](https://music.youtube.com) and [Spotify](https://open.spotify.com) — scan, sort, de-duplicate, tag and
bulk-edit, without leaving the page.

## Changelog

- **0.4.5** — Drag-and-drop reordering (0.4.4) now works in all four layouts, not just Classic — Status rail,
  Console and Spine each got a grip handle and `draggable` row added to their own bespoke track-row rendering.
  The drag logic itself (`panel.js`) needed no changes at all: it was already layout-agnostic, keyed only off a
  `[draggable="true"][data-key]` row and generic `.dragging`/`.drop-before`/`.drop-after` classes — those classes
  moved from Classic-only CSS to a shared rule so all four layouts get the same drop-indicator styling for free.
- **0.4.4** — Manual drag-and-drop reordering, right in the panel's own track table (YTM, Classic layout for now):
  drag the grip handle on any row to move it, or check several rows first and drag one of them to move the whole
  checked set together, preserving their relative order. This is a "Custom order" sort mode like any other — pick
  it (or drag once, which selects it automatically) then **Apply order** physically reorders the real playlist to
  match, same as any other sort. This is entirely within the panel's own DOM, so — unlike physically reordering the
  *real* playlist — there's no trusted-input problem to work around: the panel is this extension's own UI, not
  YTM's. Disabled while a filter is active (reordering a filtered subset while other tracks stay hidden has no
  obviously-correct interleaving, so this asks you to clear the filter first rather than guessing).
- **0.4.3** — More of the panel is now visible track list instead of chrome: tightened header/tabs/toolbar/footer
  padding and row padding, and shortened "Apply to playlist" to **Apply order** so it fits on the same toolbar row
  as Rescan/filter/sort instead of forcing a second row on its own. Also fixed `panel.css`/`theme.css` being
  fetched with default HTTP caching — a `chrome-extension://` resource can keep serving an old cached response
  after the extension reloads with a changed file on disk, unlike content scripts (always re-injected fresh); both
  fetches now use `cache: 'no-store'`.
- **0.4.2** — **Apply to playlist** (YTM only): the panel's sort can now physically reorder the real playlist, not
  just the panel's own view — pick a sort, hit **Apply to playlist**, confirm. Uses the same InnerTube endpoint
  YTM's own drag-reorder calls (`browse/edit_playlist`), since a content script can't simulate the trusted
  OS-level drag gesture the on-page UI requires (confirmed live: neither synthetic `MouseEvent`s nor `PointerEvent`s
  triggered it). The endpoint needs a fuller identity proof than the existing release-date lookups do — a
  SAPISID-hash `Authorization` header plus `X-Goog-AuthUser`/`X-Goog-Visitor-Id`/`X-Goog-PageId`, all read from the
  page's own inline config — and a per-playlist-*entry* id (`setVideoId`) the existing scraper didn't capture,
  fetched via a new background service worker since a content script's isolated world can't see the page's own
  `row.getSetVideoId()` (a new `scripting` permission + `src/background/background.js`, using
  `chrome.scripting.executeScript({world:'MAIN'})` as the bridge). Spotify isn't supported — its virtualized track
  list makes even the live/experimental groundwork this would need too unreliable to ship (see
  [Notes](#notes)).
- **0.4.1** — Two new sort modes for the common "by artist, then title" / "by title, then artist" playlist conventions:
  **Title, then artist** (new) and **Artist, then title** (the existing Artist sort, relabeled — it already broke title
  ties this way). Both still have a direction toggle for the primary key.
- **0.4.0** — Visual redesign: the panel is now themeable. A new **Theme** tab lets you pick a colour scheme (Steel,
  Verdigris, Ember, Mist, Linen), a row density (Compact/Thumbnails/Roomy), an accent glow (on/off), and — the
  biggest change — a **layout**: Classic tabs (closest to before), Status rail (icon rail + conic scan progress +
  side-by-side duplicate comparison), Console (dense monospace view with a live scan log and a +/- diff for
  duplicates), or Spine (a vertical timeline with an equalizer meter while scanning and "merge stack" duplicate
  cards). All four share the same scan/sort/duplicate/tag data, so switching layouts never loses anything, and the
  choice syncs across tabs and devices via `chrome.storage.sync`. The floating "Organizer" toggle button is replaced
  by a slim edge tab built into the panel itself. Track rows also gained thumbnails.
- **0.3.5** — The "Remixes & other versions" duplicate matcher now also recognises anime/game release conventions:
  "(TV size)", "(Off Vocal)"/"(On Vocal)", "(Full ver.)", "(Short ver.)", "(Game size)", "(Movie size)", "(OVA size)",
  romanized or in katakana. These are flagged the same way every other version marker is — selectable in the
  Duplicates tab, never removed automatically.
- **0.3.4** — Fixed bulk remove/add failing every time on some playlists' row menus (reported against an owned
  playlist, whose menu has more items than a read-only one). The richer diagnostics added in 0.3.3 showed the menu
  was very likely opening for real, but YTM's overlay-open check only trusted a Polymer `.opened` property/attribute
  and never fell back to checking whether the menu was actually rendered on screen — for a row-menu variant that
  doesn't expose that property the same way, an open menu still looked closed. It now falls back to a genuine
  on-screen visibility check (verified live: a closed menu collapses to 0×0, an open one reaches its real size within
  ~150ms) whenever the property check doesn't resolve it.
- **0.3.3** — Opening a track's menu now retries once (closing and re-clicking) before giving up, in case the first
  click is missed while the row is still settling into view. If it still fails, the error now reports what actually
  happened in the page — whether a menu element exists at all, and its open/hidden state — instead of just "Menu did
  not open", to help pin down failures that a visible, focused tab doesn't explain.
- **0.3.2** — If a bulk remove/add's tab isn't visible or focused, each menu attempt used to silently burn its full
  ~3-second timeout before failing with a generic "Menu did not open" — both sites' menu-opening animations stall
  indefinitely in a backgrounded tab (Chrome throttles the rendering work involved). It now fails immediately with
  "This tab is not visible or focused — bring it to the foreground and try again" instead. Separately, the batch
  result message ("Stopped." vs "Done.") now reflects whether anything was actually skipped, rather than just
  whichever value the cancel flag happened to hold once the batch finished — a fully-attempted (even if fully
  failed) batch now correctly reports "Done.", not "Stopped.".
- **0.3.1** — Navigating to a different playlist (or away from the playlist page) while a scan is running now stops it
  cleanly instead of letting it keep scrolling/reading whatever page you've landed on: the panel switches to the new
  playlist immediately, the stray scan is cancelled within a fraction of a second, and its progress bar is cleared
  rather than showing a result for a playlist you never scanned. The same cancellation now also applies to an
  in-flight bulk remove/add or release-date lookup, so navigating away stops those too instead of leaving them to keep
  clicking through menus on the page you've since left.
- **0.3.0** — Added Spotify support (`open.spotify.com`). The extension now has one panel that adapts to whichever site
  it's on; features and their coverage differ by platform — see [Platform differences](#platform-differences) below.
- **0.2.0** — Sort by artist (A–Z), release date, or artist-then-date, each with a direction toggle. Release dates are
  looked up from YouTube Music itself and cached. Duplicate matching gained two optional toggles (remixes/versions,
  feat./collab variants) with multilingual marker recognition (English, Spanish, Portuguese, French, German, Italian,
  Dutch, Turkish, Polish, Russian, Ukrainian, Korean, Japanese, Chinese). Bulk "Remove"/"Add to playlist" now target
  menu items by YouTube's own icon identifier instead of matching English text, so they work in any interface language;
  the text-regex settings in the popup are kept only as a fallback.
- **0.1.0** — Initial release (YouTube Music only): scan, sort/filter, exact + fuzzy duplicate detection, bulk
  remove/add, stats, tags/notes, CSV/JSON export.

## Features

- **Scan** a playlist to read every track's title, artist(s), album, duration and an id. How this happens differs by
  platform — see below.
- **Sort & filter** the track list and jump to any track on the page. Sort modes, each with both directions:
  - Playlist order · Title A → Z / Z → A · Title-then-artist · Artist-then-title A → Z / Z → A · Album · Duration
  - **YTM only**: Release date oldest ↔ newest, and Artist-then-release-date
  - **Spotify only**: Date added oldest ↔ newest
- **Drag-and-drop reordering** (**YTM, all layouts**): drag a row's grip handle to move it, or check several
  rows and drag one to move the whole set together. Becomes a "Custom order" sort like any other.
- **Apply to playlist** (**YTM only**): physically reorders the real playlist to match the current sort — including
  a drag-and-drop custom order — instead of just changing this panel's own view of it. See
  [How reordering works](#how-reordering-works).
- **Duplicates**: always flags exact duplicates (same track) and "same song" (same title + same artists, ignoring feat.
  credits and upload labels like "(Official Audio)"). Two optional matchers, remembered between sessions:
  - **Remixes & other versions**: "(Remix)", "- Sped Up", "(Live)", "[Remastered]", "(Taylor's Version)"… count as the
    same song. Markers are recognised in English, Spanish, Portuguese, French, German, Italian, Dutch, Turkish,
    Indonesian, Polish, Russian, Ukrainian, Korean, Japanese and Chinese (e.g. "(En Vivo)", "(Ao Vivo)", "现场版",
    "リミックス", "라이브"), including full-width brackets （）【】「」. Also covers anime/game release conventions —
    "(TV size)", "(Off Vocal)"/"(On Vocal)", "(Full ver.)", "(Short ver.)", "(Game size)", "(Movie size)", "(OVA size)",
    romanized or in katakana (TVサイズ, オフボーカル).
  - **Feat. / collab versions**: the same title by "A" and by "A, B" (or "A feat. B") count as the same song.
  The first entry in each group is the suggested keeper (plain title, fewest artists, earliest in the playlist). One
  click selects every other copy.
- **Bulk actions** on selected tracks, driven through the site's own menus — *Remove selected* (playlists you own) and
  *Add to playlist…* in the order currently shown, so you can build a sorted or de-duplicated copy of a playlist.
- **Stats**: total length, average track, distinct artists, duplicate count, and (where a date is available) oldest/newest.
- **Tags, colours and notes** per playlist, stored locally (`chrome.storage`), shared across both services. The
  "Tagged" tab lists every playlist you've tagged on either site, with a link that opens it on the right one.
- **Export** the track list as CSV or JSON, or copy it as text. Tags can be exported/imported from the popup.

## Platform differences

The two sites' web apps are built very differently, which shows up in what's automatic versus manual, and in what's
been verified against a real account versus implemented from structural inspection alone.

|  | YouTube Music | Spotify |
|---|---|---|
| Loading the full playlist | Automatic — the panel scrolls the page for you | **Manual** — Spotify's track list only loads more rows in response to real scrolling; script-driven scrolling doesn't trigger it (verified live). Click **Scan**, then scroll down through the playlist yourself; the count updates live as you go, and stays open to new rows for as long as the panel tab is open. |
| Release date sort | Yes, looked up from YouTube's own endpoints (see below) | Not available — Spotify doesn't expose it without official API access this extension doesn't use (see [Notes](#notes)) |
| Date-added sort | Not shown by YTM | Yes, read straight from the playlist's "Date added" column |
| Bulk actions, language independence | Menu items matched by icon id — works in any interface language | Only "Add to playlist" has a stable, language-independent signal (its icon, verified live). "Remove from this playlist" has no such signal and is matched by English text by default — **edit the pattern in the popup's Settings if your interface isn't English** |
| Bulk actions, verified against a real account | Yes | Structurally implemented and the menus were verified to open correctly, but the actual remove/add clicks were **not** verified end-to-end (this environment had no logged-in Spotify account to test against safely). Try it on a couple of tracks first; if it can't find the menu item, the error message says so and the popup's Settings let you adjust the text pattern. |
| Library / tagged-playlists page | Full support — reads YTM's own Library page | Not scraped (Spotify's library is a sidebar panel, not a page); the cross-service **Tagged** tab still works fine everywhere |

## Install

**From this folder (developer mode)**

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
3. Open a playlist on music.youtube.com or open.spotify.com and click the slim tab on the right edge of the page to
   open the panel.

**From the zip** (`dist/playlist-organizer-<version>.zip`): unzip it anywhere permanent, then follow the steps above
and pick the unzipped folder. Chrome loads it from that location, so don't delete it afterwards.

After editing the code, click the ↻ reload icon on the extension's card in `chrome://extensions`, then reload the tab.

**Chrome Web Store** (to install without developer mode, or share it): create a developer account at
https://chrome.google.com/webstore/devconsole (one-time fee), click **New item**, upload the zip from `dist/`, fill in
the listing and privacy fields (it uses the `storage` and `scripting` permissions and host permissions for
music.youtube.com and open.spotify.com, and sends no data anywhere except to those two services' own endpoints on
your behalf), and submit for review. Rebuild the zip after bumping `version` in `manifest.json`.

Note: Chrome on Windows and macOS refuses `.crx` files that don't come from the Web Store, so use the unpacked folder or the store.

**Rebuild the zip** (PowerShell, from this folder):

```powershell
$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
Compress-Archive -Force -Path manifest.json,icons,src -DestinationPath "dist/playlist-organizer-$v.zip"
```

## How bulk actions work

The extension never talks to either service's official API for this. "Remove" and "Add to playlist" open each track's
own action menu and click the same items you would.

- It works only when you're signed in, and "Remove" only on playlists you own.
- It's sequential and deliberately paced (default 600 ms between steps, configurable in the popup).
- Keep the tab visible while it runs — both sites' menu-opening animations stall indefinitely in a backgrounded or
  unfocused tab (Chrome throttles the rendering work involved), which the extension now detects and reports
  immediately rather than timing out per track.
- You can stop a batch at any time from the progress bar, and navigating to a different playlist stops it automatically.

Reordering isn't possible through either site's UI without drag-and-drop, so on **Spotify** sorting in the panel is
still just a view onto the existing playlist, not a change to it — to get an actually-sorted Spotify playlist,
create an empty one, sort the panel, select all, **Add to playlist…**. **YTM** has a real **Apply to playlist**
action instead — see below.

## How reordering works

Two different mechanisms, easy to conflate:

- **Dragging rows inside this panel** (the "Custom order" sort, all four layouts) is the panel's own drag-and-drop,
  entirely within the panel's own DOM/JS — the panel is this extension's UI, not YTM's, so there's no trusted-input
  problem here at all; a normal `dragstart`/`dragover`/`drop` implementation works exactly as it would on any
  other web page.
- **Physically moving tracks in the real playlist** (what **Apply to playlist** does, for *any* sort including a
  dragged custom one) is the hard part described below, because that *does* mean reaching into YTM's own UI/data.

**YTM only.** Reordering is not done through the on-page drag UI — a content script can't simulate the trusted,
OS-level input that requires (confirmed live: dispatching synthetic `MouseEvent`/`PointerEvent` sequences at a row
does nothing; only genuine OS-level input triggers it). **Apply to playlist** instead calls the same InnerTube
endpoint (`youtubei/v1/browse/edit_playlist`, action `ACTION_MOVE_VIDEO_BEFORE`) that YTM's own client calls when a
real drag completes, captured live from an actual drag while watching the network tab.

- It moves every track to a target order using the minimum number of "move X before Y" calls (`length - 1`),
  issued from the *end* of the target order backward — the only issue order that's guaranteed to converge to the
  right order regardless of the playlist's starting order.
- Each move needs the two tracks' `setVideoId`s — an id per playlist-*entry* (not per video), read via
  `row.getSetVideoId()` on YTM's own Polymer element. A content script's isolated world can't see that method (or
  any other JS a page attaches to its own elements) even though the exact same call from the page's own console
  works fine, so `hydrateSetVideoIds()` fetches it through the background service worker instead, via
  `chrome.scripting.executeScript({world:'MAIN'})` — the documented way to run code in the page's real JS context.
- The endpoint also needs proof of identity beyond the cookies+API-key this extension's existing release-date
  lookups get by with: a SAPISID-hash `Authorization` header (computed the same way YTM's own JS does, from the
  `SAPISID`/`__Secure-3PAPISID` cookie — deliberately not `HttpOnly`, precisely so page JS can do this), plus
  `X-Goog-AuthUser`, `X-Goog-Visitor-Id` and `X-Goog-PageId`, all read from the page's own inline `ytcfg` config.
  Missing any one of these 401s or 403s with no reason more specific than "PERMISSION_DENIED" — there's no server
  feedback pointing at which header is missing.
- It edits the playlist directly, the same way a real drag would: there's no undo besides sorting and applying
  again. Stopping partway leaves whatever already moved moved.
- Not available on **Spotify** — its virtualized track list means most of this groundwork wasn't even attempted;
  see [Notes](#notes).

## Project layout

```
manifest.json
icons/                      16/48/128 px icons
src/background/background.js  service worker; the only thing with `scripting` — runs the one bit of code
                            (reading `row.getSetVideoId()`) a content script's isolated world can't reach itself
src/lib/utils.js            helpers (normalize, durations, CSV, download) — shared, no site knowledge
src/lib/storage.js          chrome.storage wrapper: settings (namespaced per service) + playlist tags/notes
src/content/ytm-dom.js      YTM adapter: selectors, scraping, AND the menu automation (the two are tightly coupled)
src/content/spotify-dom.js  Spotify adapter: selectors, scraping, AND the menu automation
src/content/site.js         picks the active adapter (YTMO.dom) by hostname; namespaces storage keys per service
src/content/metadata.js     YTM-only: internal browse/player/edit_playlist endpoints — release-date lookup (cached)
                            and the authenticated fetch() the physical-reorder feature uses to move playlist items
src/content/automation.js   thin generic dispatcher onto YTMO.dom + the shared sequential batch runner
src/content/theme.css       theme token layer — every panel colour/space/radius/shadow lives here, nothing else declares one
src/content/theme.js        theme store: load/save/apply/subscribe over chrome.storage.sync, synced across tabs and devices
src/content/icons.js        small local icon set (inline SVG, currentColor) used throughout the panel
src/content/layout-shared.js  content shared by every layout for the tabs with no bespoke per-layout treatment
                            (Stats, Tags & notes, Tagged, Theme) — tracks/duplicates views are bespoke per layout
src/content/layout-classic.js  "Classic tabs" layout — closest to the pre-redesign panel
src/content/layout-rail.js     "Status rail" layout — icon rail with a conic scan-progress ring, compare-card duplicates
src/content/layout-console.js  "Console" layout — dense monospace, live scan log, +/- duplicate diff view
src/content/layout-spine.js    "Spine" layout — vertical timeline, equalizer scan meter, merge-stack duplicates
src/content/panel.js        the side panel UI (Shadow DOM, no framework) — owns state/actions; rendering is delegated
                            to the active layout module (YTMO.layouts.<id>) chosen by the saved theme
src/content/panel.css       shared panel structure + one section per layout; colours always come from theme.css
src/content/content.js      entry point; library badges (YTM only, gated by capabilities)
src/popup/                  toolbar popup: tagged playlists (both services), settings, import/export
```

Each site adapter exposes the same shape (`getPageType`, `scrapeTracks`, `loadAllRows`, `removeTrack`,
`addTrackToPlaylist`, a `capabilities` object, etc.) so `panel.js` and `automation.js` don't need to know which site
they're running on. If a site changes its markup, the fix is isolated to that one adapter file.

## Notes

- **Why no release dates on Spotify**: YTM's release-date lookups work by calling YouTube's own internal endpoints
  directly from the page, the same way the page's own code does — a technique that only works because YouTube didn't
  block it when tested. The equivalent approach on Spotify (reusing the web player's own access token to call
  `api.spotify.com`) was tried during development and returned an HTTP 403 from an anonymous session, meaning
  Spotify actively blocks this in at least some circumstances; rather than build a feature around fighting that, this
  version leaves it out. The Spotify Web API does expose it (`GET /v1/albums/{id}`) for an app that goes through
  proper OAuth, which this extension doesn't currently implement.
- **Why Spotify scanning needs manual scrolling**: verified live against a real public playlist — Spotify's track list
  is virtualized (off-screen rows are removed from the page, not just hidden) and only remounts more rows in response
  to genuine scroll input. Setting the scroll position from script, or dispatching synthetic wheel/scroll events,
  moves the visible scroll position but does not trigger more rows to load; only real mouse-wheel/scrollbar-drag
  input does. The panel works around this by passively collecting every row it's ever seen (via a `MutationObserver`)
  for as long as it's open, rather than trying to drive the scrolling itself.
- Release-date lookups (YTM) call `music.youtube.com/youtubei/v1/browse` (one per album) and `/player` (one per
  track) from the page's own origin, a few at a time. A 100-track playlist takes roughly 10–20 seconds the first
  time; afterwards it's cached.
- **Why physical reordering is YTM-only**: the same virtualization that makes Spotify scanning need manual
  scrolling (above) means most of a Spotify playlist's rows don't exist in the DOM at all until scrolled into view.
  YTM's reorder works by calling an authenticated endpoint directly (no drag simulation involved — see
  [How reordering works](#how-reordering-works)), so virtualization isn't the blocker there; a Spotify equivalent
  would need its own reverse-engineered endpoint and auth scheme from scratch, which hasn't been attempted.
- Selectors were verified against both sites in September 2026. Both change their markup from time to time; everything
  DOM-specific is isolated to `src/content/ytm-dom.js` / `src/content/spotify-dom.js`.
- No data leaves your browser. Permissions are `storage` and `scripting` (the latter only to read one id — see
  [How reordering works](#how-reordering-works) — never to inject or run arbitrary code), scoped to
  music.youtube.com and open.spotify.com.
