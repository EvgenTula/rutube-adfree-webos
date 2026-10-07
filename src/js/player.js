const MEDIA_EVENTS = Object.freeze([
  "loadstart",
  "loadedmetadata",
  "durationchange",
  "canplay",
  "playing",
  "pause",
  "waiting",
  "stalled",
  "seeking",
  "seeked",
  "timeupdate",
  "progress",
  "volumechange",
  "ended",
  "error",
]);

const CLOSE_REASONS = Object.freeze([
  "app-stop",
  "back",
  "ended",
  "error",
  "replay",
  "source-replaced",
  "suspend",
  "user",
]);

const NO_DIAGNOSTICS = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function safeNumber(value, fallback) {
  return finite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeCloseReason(reason) {
  return CLOSE_REASONS.indexOf(reason) === -1 ? "closed" : reason;
}

function freezeError(error) {
  const safe = {};
  for (const key of Object.keys(error)) {
    const value = error[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return Object.freeze(safe);
}

function failure(error) {
  return Object.freeze({ ok: false, error: freezeError(error) });
}

function success(value) {
  return Object.freeze({ ok: true, value });
}

function safeQualities(qualities) {
  if (!Array.isArray(qualities)) return Object.freeze([]);
  return Object.freeze(qualities.map((entry) => {
    const quality = entry && typeof entry === "object" ? entry : {};
    return Object.freeze({
      width: finite(quality.width) ? quality.width : null,
      height: finite(quality.height) ? quality.height : null,
      bandwidth: safeNumber(quality.bandwidth, 0),
      frameRate: safeNumber(quality.frameRate, 0),
      codecs: Object.freeze(Array.isArray(quality.codecs) ? quality.codecs.filter((codec) => typeof codec === "string") : []),
    });
  }));
}

function safeCodecs(codecs) {
  return Object.freeze(Array.isArray(codecs) ? codecs.filter((codec) => typeof codec === "string") : []);
}

function sourceMetadata(source) {
  return {
    kind: source.kind,
    manifest: source.manifest,
    seekable: source.seekable,
    durationMs: finite(source.durationMs) ? source.durationMs : undefined,
    codecs: Array.isArray(source.codecs) ? source.codecs.slice() : [],
    qualityCount: Array.isArray(source.qualities) ? source.qualities.length : 0,
    advertising: typeof source.advertising === "string" ? source.advertising : "unknown",
  };
}

function validSource(source) {
  return Boolean(
    source &&
    (source.kind === "vod" || source.kind === "live") &&
    source.manifest === "hls" &&
    typeof source.url === "string" &&
    /^https:\/\//i.test(source.url) &&
    typeof source.seekable === "boolean",
  );
}

function expirationTime(source) {
  if (!source || typeof source.expiresAt !== "string") return null;
  const value = Date.parse(source.expiresAt);
  return Number.isFinite(value) ? value : null;
}

function safeNativeName(error) {
  const name = error && typeof error.name === "string" ? error.name : "Error";
  const known = ["AbortError", "InvalidStateError", "NotAllowedError", "NotSupportedError"];
  return known.indexOf(name) === -1 ? "Error" : name;
}

function safeRead(media) {
  try {
    const value = media.read();
    return value && typeof value === "object" ? value : {};
  } catch (_error) {
    return {};
  }
}

function createInitialModel() {
  return {
    state: "closed",
    kind: null,
    seekable: false,
    durationMs: null,
    positionMs: 0,
    volume: 1,
    muted: false,
    suspended: false,
    qualityMode: "auto",
    qualities: Object.freeze([]),
    codecs: Object.freeze([]),
    error: null,
    closeReason: null,
  };
}

/**
 * Wrap an HTMLMediaElement without exposing DOM events to the Player caller.
 * The active class makes only the video fill the viewport; it installs no
 * document-level keep-awake policy.
 */
export function createNativeMediaAdapter(element, { activeClass = "player-media-active" } = {}) {
  if (!element || typeof element.addEventListener !== "function") {
    throw new TypeError("A media element is required");
  }

  function readSeekable() {
    const ranges = [];
    const seekable = element.seekable;
    if (!seekable) return ranges;
    for (let index = 0; index < seekable.length; index += 1) {
      ranges.push([seekable.start(index), seekable.end(index)]);
    }
    return ranges;
  }

  return Object.freeze({
    subscribe(name, listener) {
      const wrapped = () => listener({
        nativeCode: element.error && finite(element.error.code) ? element.error.code : null,
      });
      element.addEventListener(name, wrapped);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        element.removeEventListener(name, wrapped);
      };
    },
    load(url) {
      element.preload = "auto";
      element.controls = false;
      element.setAttribute("playsinline", "");
      element.setAttribute("webkit-playsinline", "");
      if (element.classList) element.classList.add(activeClass);
      element.src = url;
      element.load();
    },
    play() {
      return element.play();
    },
    pause() {
      element.pause();
    },
    seek(seconds) {
      element.currentTime = seconds;
    },
    setVolume(volume) {
      element.volume = volume;
    },
    setMuted(muted) {
      element.muted = muted;
    },
    read() {
      return {
        currentTimeSeconds: element.currentTime,
        durationSeconds: element.duration,
        volume: element.volume,
        muted: element.muted,
        paused: element.paused,
        ended: element.ended,
        readyState: element.readyState,
        seekableRanges: readSeekable(),
        nativeErrorCode: element.error && finite(element.error.code) ? element.error.code : null,
      };
    },
    unload() {
      let firstError = null;
      try {
        element.pause();
      } catch (error) {
        firstError = error;
      }
      try {
        element.removeAttribute("src");
      } catch (error) {
        if (!firstError) firstError = error;
      }
      try {
        if (element.classList) element.classList.remove(activeClass);
      } catch (error) {
        if (!firstError) firstError = error;
      }
      try {
        element.load();
      } catch (error) {
        if (!firstError) firstError = error;
      }
      if (firstError) throw firstError;
    },
  });
}

/** Create the stateful playback module described by ADR 0001. */
export function createPlayer({
  media,
  diagnostics = NO_DIAGNOSTICS,
  visibilitySource = typeof document === "undefined" ? null : document,
  startTimeoutMs = 15000,
  clock = () => Date.now(),
  timers = { setTimeout, clearTimeout },
} = {}) {
  const requiredMediaMethods = [
    "subscribe",
    "load",
    "play",
    "pause",
    "seek",
    "setVolume",
    "setMuted",
    "read",
    "unload",
  ];
  if (!media || requiredMediaMethods.some((name) => typeof media[name] !== "function")) {
    throw new TypeError("A platform media adapter is required");
  }
  if (!finite(startTimeoutMs) || startTimeoutMs <= 0) {
    throw new TypeError("startTimeoutMs must be a positive number");
  }

  let model = createInitialModel();
  let currentSnapshot = Object.freeze({ ...model });
  let sourceRef = null;
  let sessionNumber = 0;
  let sessionActive = false;
  let desiredPlaying = false;
  let resumeAfterVisibility = false;
  let startTimer = null;
  let pendingOpen = null;
  let mediaUnsubscribers = [];
  let visibilityListener = null;
  let lastDiagnosedState = "closed";
  let playRequestNumber = 0;
  const subscribers = new Set();

  function diagnostic(level, event, details) {
    try {
      const method = diagnostics[level];
      if (typeof method === "function") method.call(diagnostics, event, details);
    } catch (_error) {
      // Diagnostics must never affect playback.
    }
  }

  function refreshFromMedia() {
    const state = safeRead(media);
    if (finite(state.currentTimeSeconds) && state.currentTimeSeconds >= 0) {
      model.positionMs = Math.round(state.currentTimeSeconds * 1000);
    }
    if (finite(state.durationSeconds) && state.durationSeconds >= 0) {
      model.durationMs = Math.round(state.durationSeconds * 1000);
    }
    if (finite(state.volume)) model.volume = clamp(state.volume, 0, 1);
    if (typeof state.muted === "boolean") model.muted = state.muted;
  }

  function publish(patch = null, readMedia = true) {
    if (patch) Object.assign(model, patch);
    if (readMedia) refreshFromMedia();
    currentSnapshot = Object.freeze({
      state: model.state,
      kind: model.kind,
      seekable: model.seekable,
      durationMs: model.durationMs,
      positionMs: model.positionMs,
      volume: model.volume,
      muted: model.muted,
      suspended: model.suspended,
      qualityMode: model.qualityMode,
      qualities: model.qualities,
      codecs: model.codecs,
      error: model.error,
      closeReason: model.closeReason,
    });
    if (model.state !== lastDiagnosedState) {
      lastDiagnosedState = model.state;
      diagnostic("info", "player.state", {
        state: model.state,
        kind: model.kind,
        closeReason: model.closeReason,
        errorCode: model.error ? model.error.code : null,
      });
    }
    for (const listener of Array.from(subscribers)) {
      try {
        listener(currentSnapshot);
      } catch (_error) {
        diagnostic("warn", "player.listener-failed", { state: model.state });
      }
    }
    return currentSnapshot;
  }

  function clearStartTimer() {
    if (startTimer === null) return;
    timers.clearTimeout(startTimer);
    startTimer = null;
  }

  function settleOpen(result) {
    if (!pendingOpen) return;
    const pending = pendingOpen;
    pendingOpen = null;
    clearStartTimer();
    pending.resolve(result);
  }

  function detachSession() {
    clearStartTimer();
    for (const unsubscribe of mediaUnsubscribers.splice(0)) unsubscribe();
    if (
      visibilityListener &&
      visibilitySource &&
      typeof visibilitySource.removeEventListener === "function"
    ) {
      visibilitySource.removeEventListener("visibilitychange", visibilityListener);
    }
    visibilityListener = null;
  }

  function unloadSession() {
    if (!sessionActive) return;
    sessionActive = false;
    detachSession();
    try {
      media.unload();
    } catch (_error) {
      diagnostic("warn", "player.unload-failed", { state: model.state });
    }
    sourceRef = null;
    desiredPlaying = false;
    resumeAfterVisibility = false;
    playRequestNumber += 1;
  }

  function sourceIsExpired() {
    const expiresAt = expirationTime(sourceRef);
    return expiresAt !== null && expiresAt <= clock();
  }

  function terminalError(error) {
    if (!sessionActive) return;
    const safeError = freezeError(error);
    const snapshot = publish({ state: "error", error: safeError, suspended: false });
    diagnostic("error", "player.failed", safeError);
    unloadSession();
    settleOpen(failure(safeError));
    return snapshot;
  }

  function onPlayRejected(error, token, opening, playRequest) {
    if (
      !sessionActive ||
      token !== sessionNumber ||
      playRequest !== playRequestNumber
    ) return null;
    const name = safeNativeName(error);
    const code = opening && name === "NotAllowedError" ? "autoplay-rejected" : "playback-failed";
    const playerError = { code, operation: opening ? "player-open" : "player-command", nativeName: name };
    terminalError(playerError);
    return freezeError(playerError);
  }

  function beginPlay(token, opening) {
    playRequestNumber += 1;
    const playRequest = playRequestNumber;
    let playResult;
    try {
      playResult = media.play();
    } catch (error) {
      return onPlayRejected(error, token, opening, playRequest);
    }
    Promise.resolve(playResult).catch((error) => onPlayRejected(error, token, opening, playRequest));
    return null;
  }

  function releaseEnded() {
    const snapshot = publish({ state: "ended", error: null, suspended: false });
    diagnostic("info", "player.ended", { kind: model.kind, positionMs: model.positionMs });
    unloadSession();
    if (pendingOpen) {
      settleOpen(failure({ code: "playback-failed", operation: "player-open", reason: "ended-before-start" }));
    }
    return snapshot;
  }

  function handleMediaEvent(name, event, token) {
    if (!sessionActive || token !== sessionNumber) return;
    if (name === "loadedmetadata" || name === "canplay") {
      if (!model.suspended && (model.state === "loading" || model.state === "buffering")) {
        publish({ state: "ready" });
      } else {
        publish();
      }
      return;
    }
    if (name === "playing") {
      desiredPlaying = true;
      const snapshot = publish({ state: "playing", suspended: false, error: null });
      settleOpen(success(snapshot));
      return;
    }
    if (name === "pause") {
      if (!model.suspended) desiredPlaying = false;
      if (model.state !== "loading") publish({ state: "paused" });
      return;
    }
    if (name === "seeking") {
      publish({ state: desiredPlaying && !model.suspended ? "buffering" : "paused" });
      return;
    }
    if (name === "seeked") {
      const restoredState = desiredPlaying ? "playing" : "paused";
      publish({ state: model.suspended ? "paused" : restoredState });
      return;
    }
    if (name === "waiting" || name === "stalled") {
      if (desiredPlaying && !model.suspended) publish({ state: "buffering" });
      else publish();
      return;
    }
    if (name === "ended") {
      desiredPlaying = false;
      releaseEnded();
      return;
    }
    if (name === "error") {
      const mediaState = safeRead(media);
      const nativeCode = event && finite(event.nativeCode)
        ? event.nativeCode
        : finite(mediaState.nativeErrorCode) ? mediaState.nativeErrorCode : 0;
      terminalError({
        code: sourceIsExpired() ? "source-expired" : "playback-failed",
        operation: pendingOpen ? "player-open" : "player-playback",
        nativeCode,
      });
      return;
    }
    publish();
  }

  function attachSession(token) {
    mediaUnsubscribers = [];
    for (const name of MEDIA_EVENTS) {
      mediaUnsubscribers.push(media.subscribe(
        name,
        (event) => handleMediaEvent(name, event, token),
      ));
    }
    if (visibilitySource && typeof visibilitySource.addEventListener === "function") {
      visibilityListener = () => {
        if (!sessionActive || token !== sessionNumber) return;
        if (visibilitySource.hidden) {
          if (model.suspended) return;
          resumeAfterVisibility = desiredPlaying;
          if (resumeAfterVisibility) {
            publish({ state: model.state === "loading" ? "loading" : "paused", suspended: true });
            playRequestNumber += 1;
            try {
              media.pause();
            } catch (_error) {
              // A pause failure is harmless during suspension; close still unloads.
            }
            clearStartTimer();
            diagnostic("info", "player.suspended", { resumePending: true });
          } else {
            publish({ suspended: true });
          }
          return;
        }

        if (!model.suspended) return;
        const shouldResume = resumeAfterVisibility;
        resumeAfterVisibility = false;
        publish({ suspended: false, state: shouldResume ? "buffering" : model.state });
        if (shouldResume) {
          if (pendingOpen) armStartTimeout(token);
          beginPlay(token, Boolean(pendingOpen));
          diagnostic("info", "player.resumed", { kind: model.kind });
        }
      };
      visibilitySource.addEventListener("visibilitychange", visibilityListener);
    }
  }

  function armStartTimeout(token) {
    clearStartTimer();
    startTimer = timers.setTimeout(() => {
      startTimer = null;
      if (!sessionActive || token !== sessionNumber || !pendingOpen) return;
      terminalError({
        code: sourceIsExpired() ? "source-expired" : "timeout",
        operation: "player-open",
        durationMs: startTimeoutMs,
      });
    }, startTimeoutMs);
  }

  function endCurrentSession(reason) {
    const safeReason = normalizeCloseReason(reason);
    if (pendingOpen) {
      settleOpen(failure({ code: "cancelled", operation: "player-open", reason: safeReason }));
    }
    unloadSession();
    model = createInitialModel();
    return publish({ closeReason: safeReason }, false);
  }

  function open(source) {
    if (model.state !== "closed") endCurrentSession("source-replaced");
    if (!validSource(source)) {
      model = createInitialModel();
      const error = freezeError({ code: "invalid-source", operation: "player-open" });
      const snapshot = publish({ state: "error", error }, false);
      diagnostic("error", "player.failed", error);
      return Promise.resolve(failure(error));
    }

    sourceRef = source;
    if (sourceIsExpired()) {
      model = createInitialModel();
      const error = freezeError({ code: "source-expired", operation: "player-open" });
      publish({ state: "error", error }, false);
      sourceRef = null;
      diagnostic("warn", "player.source-expired", { kind: source.kind });
      return Promise.resolve(failure(error));
    }

    sessionNumber += 1;
    const token = sessionNumber;
    sessionActive = true;
    desiredPlaying = true;
    resumeAfterVisibility = false;
    model = {
      state: "loading",
      kind: source.kind,
      seekable: source.seekable,
      durationMs: finite(source.durationMs) ? source.durationMs : null,
      positionMs: 0,
      volume: 1,
      muted: false,
      suspended: false,
      qualityMode: "auto",
      qualities: safeQualities(source.qualities),
      codecs: safeCodecs(source.codecs),
      error: null,
      closeReason: null,
    };

    const openPromise = new Promise((resolve) => {
      pendingOpen = { resolve, token };
    });
    try {
      attachSession(token);
      publish(null, false);
      diagnostic("info", "player.open", sourceMetadata(source));
      armStartTimeout(token);
      media.load(source.url);
    } catch (_error) {
      terminalError({ code: "playback-failed", operation: "player-open", nativeName: "LoadError" });
      return openPromise;
    }
    if (visibilitySource && visibilitySource.hidden) {
      resumeAfterVisibility = true;
      clearStartTimer();
      publish({ suspended: true });
      playRequestNumber += 1;
      try {
        media.pause();
      } catch (_error) {
        // The session remains deferred and can still start when visible.
      }
    } else {
      beginPlay(token, true);
    }
    return openPromise;
  }

  function commandFailure(code, details = {}) {
    return failure({ code, operation: "player-command", ...details });
  }

  function commandPlay() {
    if (!sessionActive || pendingOpen || model.state === "ended" || model.state === "error") {
      return commandFailure("invalid-state", { state: model.state });
    }
    desiredPlaying = true;
    if (visibilitySource && visibilitySource.hidden) {
      resumeAfterVisibility = true;
      publish({ state: "paused", suspended: true });
    } else {
      publish({ state: "buffering" });
      const playError = beginPlay(sessionNumber, false);
      if (playError) return failure(playError);
    }
    return success(currentSnapshot);
  }

  function commandPause() {
    if (!sessionActive || pendingOpen || model.state === "ended" || model.state === "error") {
      return commandFailure("invalid-state", { state: model.state });
    }
    desiredPlaying = false;
    resumeAfterVisibility = false;
    playRequestNumber += 1;
    try {
      media.pause();
    } catch (_error) {
      return commandFailure("playback-failed");
    }
    return success(publish({ state: "paused" }));
  }

  function nearestSeekablePosition(target, ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) return target;
    const normalized = ranges
      .filter((range) => Array.isArray(range) && finite(range[0]) && finite(range[1]) && range[1] >= range[0])
      .sort((left, right) => left[0] - right[0]);
    if (normalized.length === 0) return target;
    if (target <= normalized[0][0]) return normalized[0][0];
    const last = normalized[normalized.length - 1];
    if (target >= last[1]) return last[1];
    for (let index = 0; index < normalized.length; index += 1) {
      const range = normalized[index];
      if (target >= range[0] && target <= range[1]) return target;
      const next = normalized[index + 1];
      if (next && target > range[1] && target < next[0]) {
        return target - range[1] <= next[0] - target ? range[1] : next[0];
      }
    }
    return target;
  }

  function commandSeek(commandValue) {
    if (!sessionActive || pendingOpen) return commandFailure("invalid-state", { state: model.state });
    if (!model.seekable) return commandFailure("seek-unsupported", { kind: model.kind });
    const mediaState = safeRead(media);
    const currentSeconds = safeNumber(mediaState.currentTimeSeconds, model.positionMs / 1000);
    let targetSeconds;
    if (commandValue.type === "seekBy" && finite(commandValue.offsetMs)) {
      targetSeconds = currentSeconds + commandValue.offsetMs / 1000;
    } else if (commandValue.type === "seekTo" && finite(commandValue.positionMs)) {
      targetSeconds = commandValue.positionMs / 1000;
    } else {
      return commandFailure("invalid-command");
    }

    const durationSeconds = finite(mediaState.durationSeconds)
      ? mediaState.durationSeconds
      : finite(model.durationMs) ? model.durationMs / 1000 : null;
    if (durationSeconds !== null) targetSeconds = clamp(targetSeconds, 0, durationSeconds);
    else targetSeconds = nearestSeekablePosition(targetSeconds, mediaState.seekableRanges);

    try {
      media.seek(targetSeconds);
    } catch (_error) {
      return commandFailure("playback-failed");
    }
    const positionMs = Math.round(targetSeconds * 1000);
    const result = success(publish({ positionMs }));
    diagnostic("info", "player.seek", { positionMs, kind: model.kind });
    return result;
  }

  function commandQuality(commandValue) {
    if (!sessionActive || pendingOpen) return commandFailure("invalid-state", { state: model.state });
    if (commandValue.quality === "auto" || commandValue.mode === "auto") {
      const result = success(publish({ qualityMode: "auto" }));
      diagnostic("info", "player.quality", { mode: "auto" });
      return result;
    }
    diagnostic("warn", "player.quality-unsupported", { mode: "native-hls-auto" });
    return commandFailure("quality-unsupported", { mode: "native-hls-auto" });
  }

  function commandVolume(commandValue) {
    if (!sessionActive || pendingOpen) return commandFailure("invalid-state", { state: model.state });
    if (commandValue.type === "setVolume" && finite(commandValue.volume)) {
      const volume = clamp(commandValue.volume, 0, 1);
      try {
        media.setVolume(volume);
      } catch (_error) {
        return commandFailure("playback-failed");
      }
      return success(publish({ volume }));
    }
    if (commandValue.type === "setMuted" && typeof commandValue.muted === "boolean") {
      try {
        media.setMuted(commandValue.muted);
      } catch (_error) {
        return commandFailure("playback-failed");
      }
      return success(publish({ muted: commandValue.muted }));
    }
    return commandFailure("invalid-command");
  }

  function command(commandValue) {
    if (commandValue === "play") return commandPlay();
    if (commandValue === "pause") return commandPause();
    if (!commandValue || typeof commandValue !== "object") return commandFailure("invalid-command");
    if (commandValue.type === "seekBy" || commandValue.type === "seekTo") return commandSeek(commandValue);
    if (commandValue.type === "selectQuality") return commandQuality(commandValue);
    if (commandValue.type === "setVolume" || commandValue.type === "setMuted") return commandVolume(commandValue);
    return commandFailure("invalid-command");
  }

  return Object.freeze({
    open,
    command,
    close(reason) {
      if (model.state === "closed") return currentSnapshot;
      return endCurrentSession(reason);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Player listener must be a function");
      subscribers.add(listener);
      listener(currentSnapshot);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        subscribers.delete(listener);
      };
    },
    snapshot() {
      return currentSnapshot;
    },
  });
}
