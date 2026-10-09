/* global window */
// Generic dispatcher over the active site adapter (YTMO.dom), plus the
// sequential batch runner shared by both services. Per-site menu-driving logic
// lives in ytm-dom.js / spotify-dom.js since the two platforms' UIs differ too
// much to share a single implementation.
(function () {
  const YTMO = (window.YTMO = window.YTMO || {});

  function closeOverlays() {
    return YTMO.dom.closeOverlays();
  }

  function removeTrack(track, settings) {
    return YTMO.dom.removeTrack(track, settings);
  }

  function addTrackToPlaylist(track, targetName, settings) {
    return YTMO.dom.addTrackToPlaylist(track, targetName, settings);
  }

  function listTargetPlaylists(track, settings) {
    return YTMO.dom.listTargetPlaylists(track, settings);
  }

  function moveItemBefore(playlistId, setVideoId, beforeSetVideoId, settings) {
    return YTMO.dom.moveItemBefore(playlistId, setVideoId, beforeSetVideoId, settings);
  }

  /**
   * Run `fn(track)` over tracks sequentially. Reports progress; stops when
   * `control.cancelled` becomes true. Returns { ok: [], failed: [{track, error}], stoppedEarly }.
   * `stoppedEarly` is only true when cancellation actually skipped remaining tracks —
   * not when every track was attempted and the flag merely happened to be set by the
   * time the last one finished, which would otherwise mislabel a fully-attempted
   * (if fully-failed) batch as "stopped".
   */
  async function runBatch(tracks, fn, { onProgress, control }) {
    const result = { ok: [], failed: [], stoppedEarly: false };
    for (let i = 0; i < tracks.length; i++) {
      if (control?.cancelled) {
        result.stoppedEarly = true;
        break;
      }
      const track = tracks[i];
      try {
        await fn(track);
        result.ok.push(track);
      } catch (e) {
        result.failed.push({ track, error: e.message || String(e) });
        await closeOverlays();
      }
      if (onProgress) onProgress(i + 1, tracks.length, track, result);
    }
    await closeOverlays();
    return result;
  }

  YTMO.auto = {
    closeOverlays,
    removeTrack,
    addTrackToPlaylist,
    listTargetPlaylists,
    moveItemBefore,
    runBatch,
  };
})();
