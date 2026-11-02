# Playlist Organizer

A Chrome extension (Manifest V3) that adds an organizer side panel to playlists on
[YouTube Music](https://music.youtube.com) and [Spotify](https://open.spotify.com) — scan, sort, de-duplicate, tag and
bulk-edit, without leaving the page.

## Changelog

- **0.8.2** — Fixes from live-testing 0.8.1. A franchise run right after a group run searched for the *previous group's member names*: the group run leaves "Include solo artists' work" ticked with its members in the box, and the franchise flow didn't clear it. The one-click flow now sets that option itself (on for a group, off for a franchise, whose characters are found by following credits). The preview's "members not matched" note no longer lists members you ticked a candidate for in the review step, and "1 act … isn't on the roster" reads correctly in the singular.
- **0.8.1** — **Pick the candidates in the flow, no Back needed.** The one-click flow no longer silently drops what it can't match. Group mode: members it isn't sure about (a sub-unit Wikipedia calls "Hoshi X Woozi" that YouTube Music calls "HxW", "S.Coups X Mingyu" → "CxM (SEVENTEEN)") pause the flow once on a "to check" list that shows **every candidate artist as a checkbox**, none ticked by default, with **Tick every candidate** / **None**; **Collect** carries on from there and takes whichever you ticked (any number per member). Franchise mode: the roster's units and characters go ahead on their own, but credited acts that aren't on the roster (a unit the Wikipedia article doesn't list, like IDOLiSH7's MEZZO") get one look first on the acts list, with a note saying how many need checking and everything on the roster already ticked. It only pauses when there is something to decide; voice actors' own pages don't count as a question. Back from the preview still gives the full lists.
- **0.8.0** — **One-click Add music.** The flow used to stop at every stage (look up → Find artist → Confirm the artists → Find songs → tick acts → Collect). The primary button is now **Look up members & find all music** (Enter in the name box does the same) and runs the whole thing: reads the roster from Wikipedia / MusicBrainz, finds the group and each member, unit and character on YouTube Music, reads all their releases, follows a franchise's characters, and stops at the preview — the only step that needs you, and nothing is added until you click Add. Group mode includes the looked-up members and sub-units automatically; franchise mode takes the roster-matched units and characters. With nobody there to confirm matches it is stricter than the manual flow: a member is only accepted on an exact name match or a name that includes the group ("BSS(SEVENTEEN)"), anything weaker is skipped and listed in the preview, as are credited acts that aren't on the roster; **Back** from the preview brings up the "Confirm the artists" / acts lists to fix either by hand. If the lookup finds no roster it stops with a message instead of searching unfiltered (which is what pulls in unrelated work). The old step-by-step path is still there as **Find artist only**. The preview also says which roster page was used. Live-checked from a single click: IDOLiSH7 → 488 songs / 147 releases, all 16 characters plus TRIGGER / Re:vale / ŹOOĻ in ~26 s; Ensemble Stars!! → 1,334 songs / 374 releases in ~40 s; SEVENTEEN → 452 songs / 127 releases, 14 of 20 members and sub-units matched. Known gap: Wikipedia names some sub-units "Hoshi X Woozi" / "S.Coups X Mingyu" while YouTube Music calls them "HxW" / "CxM (SEVENTEEN)", and S.Coups and Mingyu have no solo page of their own, so those show up in the "not matched" list — Back offers the real candidates to pick.
- **0.7.4** — "Look up members online" now explains itself when the extension was reloaded or updated after the tab opened (Chrome's raw message is "Extension context invalidated."): it says to reload the tab, instead of showing the browser's wording. Nothing was wrong with the lookup itself; the open tab was just still running the old copy of the extension.
- **0.7.3** — **Errors-badge fix (stylesheet loading).** The panel used to `fetch()` its own `theme.css` / `panel.css` from inside the YouTube Music page. That request is made *as the page*, and whenever the browser refused it Chrome logged "Unsafe attempt to load URL chrome-extension://…/theme.css from frame with URL https://music.youtube.com/… Domains, protocols and ports must match." itself, into the extension's Errors list, where no `try/catch` could stop it (the 0.5.2 guard only prevented a second, uncaught error). The background worker now reads both files and sends them over (one retry if it is still waking up), so the page never requests a `chrome-extension://` URL; the now-unused `web_accessible_resources` entry is removed from the manifest. If the extension was reloaded under an open tab the panel simply doesn't appear in that tab until it is reloaded, with no error logged.
- **0.7.2** — Fixes found while re-checking 0.7.1 in the real extension. (1) Unit headings on Wikipedia are written as `{{Nihongo|RYUSEITAI|流星隊}}` templates, which the 0.7.1 fix didn't handle (the whole heading was discarded), so RYUSEITAI and AKATSUKI were still listed "not on roster"; the Latin name is now kept. (2) The 0.7.1 full-window Esc handler also reacted to the *synthetic* Escape keys the extension sends to close YouTube Music's own menus during "Add to playlist", which knocked the panel out of full-window mode mid-operation; only real key presses count now. (3) The panel's own dialogs (Add to playlist, Remove, Reorder) never closed on Esc despite the earlier comment saying so; they do now, and Esc inside a dialog closes only the dialog.
- **0.7.1** — **Full-window Esc fix**: Esc only reached the panel while keyboard focus was inside it, and the re-render after toggling dropped focus, so after the first Esc (full window → side panel) a second one did nothing. Focus is now kept in the panel after toggling, and in full-window mode Esc also works from anywhere on the page (docked, Esc is still left to YouTube Music). Roster lookup: unit headings that carry a native-script name in brackets (Wikipedia's "RYUSEITAI (流星隊)", "AKATSUKI (紅月)") now match the plain unit name YouTube Music credits, so those units are ticked instead of listed as "not on roster". Live-checked in the real extension: IDOLiSH7 in franchise mode gives all 16 characters plus TRIGGER / Re:vale / ŹOOĻ / MEZZO" (about 8 s after the lookup), and Ensemble Stars!! gives 1,285 songs from 365 releases in about 40 s end to end, every credit a roster unit or character.
- **0.7.0** — **Member / cast lookup (opt-in)** for Add music. Both "Include solo artists' work" and Franchise mode now have a **Look up members online** button. It reads the real roster from Wikipedia (member lists, and the Characters / voice-cast sections of franchise articles, with their units) and MusicBrainz (band-membership relations; only when the name resolves to one clearly-best group), through the extension's background worker. Group mode: the member box is filled with the group's real members and sub-units (still editable), so the artist search starts from the right names. Franchise mode: every discovered act is checked against the roster. Characters and units on it start ticked, and only roster characters are followed automatically; **voice actors credited under their own name, or as another character, are tagged "voice actor — other work" and start unticked**, and acts not on the roster are tagged and unticked instead of being pulled in. Name matching ignores case, punctuation, word order and romanization differences (Kujō / Kujo / Kujou). Even without a lookup, a voice actor seen in the `Name(CV.Actor)` credits who also appears as a separate artist is now unticked. New host permissions: `en.wikipedia.org`, `musicbrainz.org`. **Nothing is sent unless you click the button**, and only the artist/franchise name you typed is sent.
- **0.6.2** — **Full-window toggle**: a button in the panel header (next to Close, in every layout) expands the panel to cover the whole browser window — all of YouTube Music — so long lists (Add music previews, track tables) are easier to read; click it again, or press Esc, to go back to the side panel. Esc backs out one level at a time (dialog, then full window, then closed), and closing the panel always returns it to the docked size. In full-window mode the content column is centred and capped at 1400px so rows don't stretch edge-to-edge on a wide monitor, and the list no longer scrolls the page behind it when it hits the end.
- **0.6.1** — Franchise mode now finds a franchise's *whole cast*. Reported on IDOLiSH7: groups all showed up but most characters didn't. Cause (checked against the live catalog): IDOLiSH7's own page has only 29 releases and credits just 5 of its 16 characters; the others (Tenn, Gaku, Momo, Yuki, Tamaki, Sogo…) are credited on releases that page doesn't list, and a character's own page lists only that character's solo releases, so neither release overlap nor the 'Fans might also like' shelf (which also mixes in other franchises: B-PROJECT, STARISH, MELLOW DEAR US…) can verify membership. What does work: characters are linked to each other through co-credits. So after collecting the acts you tick, any newly credited *character-style* act ("Name(CV.Actor)") is followed automatically, round after round, until no new ones appear (cap 150). Simulated on IDOLiSH7: 10 known characters → all 16 (7 + 3 + 2 + 4) in two rounds, 9 s, nothing from other franchises. Guests, orchestras and composers aren't followed; other newly credited acts are added to the list for manual ticking (acts already collected are marked). Characters now start ticked regardless of release count.
- **0.6.0** — **Franchise mode** for Add music. Tick "Franchise mode" and search a franchise's own artist page (e.g. Ensemble Stars!!, IDOLiSH7): after reading all its releases, the extension lists every group/unit and character credited on them (found from the release credits themselves — exact artist pages, no name guessing, so no wrong-person matches), with how many releases each appears on. Tick which to collect in full — releases already read are skipped, so it mainly adds works the franchise page doesn't list, e.g. fusion-unit singles and solo releases. Characters are told apart from groups by the "Name(CV.Voice Actor)" credit pattern ('Groups only' shortcut); one-off credits start unticked since they're often guests with unrelated catalogs. Measured on Ensemble Stars!!: the franchise page alone is 320 releases (49 albums + 271 singles, 3 grid pages) with 125 distinct credited acts, and unit pages added releases the franchise page lacked (e.g. "RYUSEITAI x Knights", an extra UNDEAD single, two from fine).
- **0.5.2** — Error hardening, after the extension's Errors badge kept returning with "Unsafe attempt to load URL chrome-extension://…/theme.css from frame with URL …". The panel's stylesheet fetch is now wrapped (on failure it removes its half-built host and logs a one-line warning instead of leaving an unstyled panel and an uncaught rejection), and every polling timer (layout, live refresh, library badges, page-change detection on both sites) now retires itself once the extension context is gone. Previously each ↻ left the old copy in any already-open tab polling chrome.* APIs forever, throwing "Extension context invalidated" every couple of seconds. Not reproducible in a fresh tab — this removes the known causes; if the badge still returns, the Errors entry's stack trace is needed.
- **0.5.1** — Add music: member lookup now searches "<member> <group>" first (a bare first name like "Joshua" or "Jun" mostly finds unrelated artists; verified live that adding the group name surfaces the right one), merges in the plain-name results, keeps the group's own page out of the member candidates, and defaults each pick to the best name match instead of always the first hit.
- **0.5.0** — **Add music** tab (YTM only): type an artist or group and the extension collects every song YouTube
  Music's own catalog lists for them — all albums, singles and EPs track by track, plus the artist's song list
  (which also brings in releases the album grids omit and songs they're only credited on as a collaborator) — then
  shows a preview grouped by release, oldest first, to review before anything is added. Alternate versions
  ("(Inst.)", "(Japanese ver.)", remixes) and duplicates across releases are detected and unticked by default
  (toggle to include them). "Include solo artists' work" takes member/sub-unit names, looks each up as an artist,
  and asks you to confirm the match before collecting (same-name artists are common — "Seventeen" also finds an
  Indonesian band). Songs can be added to the current playlist or to a new private one. No LLM is involved: the
  catalog is the only source, so no song can be invented, but very old or region-locked releases may be missing.
  Notable finding: YTM's `dedupeOption: DEDUPE_OPTION_SKIP` flag on add is accepted but **ignored** (re-adding a
  song makes a second copy), so duplicates are filtered client-side against the playlist's live contents.
  Also: "(Inst.)" and "a cappella" now count as version markers in duplicate matching.
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
    Indonesian, Polish, Russian, Ukrainian, Korean, Japanese and Chinese (e.g. "(En Vivo)", "(Ao Vivo)", "çŽ°åœºç‰ˆ",
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
- No data leaves your browser, with one opt-in exception: **Look up members online** (Add music tab) sends the artist or
  franchise name you typed to Wikipedia and MusicBrainz, and only when you click it. Permissions are `storage` and `scripting` (the latter only to read one id — see
  [How reordering works](#how-reordering-works) — never to inject or run arbitrary code), scoped to
  music.youtube.com and open.spotify.com.
