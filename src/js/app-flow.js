const NO_DIAGNOSTICS = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function errorCode(result) {
  return result && result.error && typeof result.error.code === "string"
    ? result.error.code
    : "unknown";
}

function retryable(result) {
  const code = errorCode(result);
  if (["offline", "opaque-network", "timeout"].indexOf(code) !== -1) return true;
  return code === "http" && result.error.status >= 500;
}

function userCanRetry(error) {
  if (!error || typeof error.code !== "string") return false;
  if (["offline", "opaque-network", "timeout", "source-expired", "autoplay-rejected", "playback-failed"].indexOf(error.code) !== -1) {
    return true;
  }
  return error.code === "http" && (typeof error.status !== "number" || error.status >= 500);
}

function cloneView(state) {
  return {
    route: state.route,
    home: state.home,
    search: state.search,
    details: state.details,
    playback: state.playback,
  };
}

function defaultDelay(milliseconds, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    if (signal) signal.addEventListener("abort", finish, { once: true });
  });
}

/** Composition root for catalog, source resolution, playback, and navigation. */
export function createAppFlow({
  catalog,
  playbackSources,
  player,
  navigation,
  renderer,
  diagnostics = NO_DIAGNOSTICS,
  delay = defaultDelay,
  retryDelayMs = 350,
  maxAttempts = 2,
} = {}) {
  if (!catalog || !playbackSources || !player || !navigation || !renderer) {
    throw new TypeError("AppFlow requires catalog, playback sources, player, navigation, and renderer");
  }

  const state = {
    route: "home",
    home: { status: "idle", items: [], nextCursor: null, total: 0, error: null, canRetry: false },
    search: { status: "idle", query: "", items: [], nextCursor: null, total: 0, error: null, canRetry: false },
    details: { status: "idle", item: null, error: null, origin: "home", canRetry: false },
    playback: {
      status: "idle",
      videoId: null,
      title: "",
      snapshot: player.snapshot(),
      error: null,
      canRetry: false,
      controlsVisible: true,
      sourceSummary: null,
    },
  };
  let running = false;
  let operation = null;
  let navigationItems = new Map();
  let unsubscribeNavigation = null;
  let unsubscribePlayer = null;

  function diagnostic(level, event, details) {
    try {
      if (typeof diagnostics[level] === "function") diagnostics[level](event, details);
    } catch (_error) {
      // Diagnostics never own application control flow.
    }
  }

  function present() {
    if (!running) return;
    const focusModel = renderer.render(cloneView(state), dispatch) || { route: state.route, items: [] };
    navigationItems = new Map(
      (focusModel.items || []).map((item) => [item.id, item]),
    );
    navigation.mount(focusModel);
  }

  function cancelOperation(reason) {
    if (!operation) return;
    if (operation.name === "home" && state.home.status === "loading") {
      state.home = { ...state.home, status: "idle" };
    } else if (operation.name === "home-more" && state.home.status === "loading-more") {
      state.home = { ...state.home, status: state.home.items.length ? "ready" : "idle" };
    } else if (operation.name === "search" && state.search.status === "loading") {
      state.search = { ...state.search, status: state.search.items.length ? "ready" : "idle" };
    } else if (operation.name === "search-more" && state.search.status === "loading-more") {
      state.search = { ...state.search, status: state.search.items.length ? "ready" : "idle" };
    }
    operation.controller.abort();
    diagnostic("debug", "flow.request-cancelled", { operation: operation.name, reason });
    operation = null;
  }

  function beginOperation(name) {
    cancelOperation("superseded");
    const entry = {
      name,
      controller: new AbortController(),
    };
    operation = entry;
    return entry;
  }

  function current(entry) {
    return running && operation === entry && !entry.controller.signal.aborted;
  }

  async function withRetry(entry, request) {
    let result;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      result = await request(entry.controller.signal);
      if (!current(entry) || result.ok || !retryable(result) || attempt === maxAttempts) return result;
      diagnostic("warn", "flow.request-retry", {
        operation: entry.name,
        attempt,
        code: errorCode(result),
      });
      await delay(retryDelayMs, entry.controller.signal);
      if (!current(entry)) return { ok: false, error: { code: "cancelled", operation: entry.name } };
    }
    return result;
  }

  function complete(entry) {
    if (operation === entry) operation = null;
  }

  async function loadHome({ append = false } = {}) {
    const entry = beginOperation(append ? "home-more" : "home");
    state.route = "home";
    state.home = {
      ...state.home,
      status: append ? "loading-more" : "loading",
      error: null,
      canRetry: false,
      items: append ? state.home.items : [],
    };
    present();
    const cursor = append ? state.home.nextCursor : null;
    const result = await withRetry(entry, (signal) => catalog.home({ cursor, signal }));
    if (!current(entry)) return;
    complete(entry);
    if (!result.ok) {
      if (errorCode(result) === "cancelled") return;
      state.home = { ...state.home, status: "error", error: result.error, canRetry: userCanRetry(result.error) };
      diagnostic("error", "flow.catalog-failed", { operation: "home", code: errorCode(result) });
      present();
      return;
    }
    const items = append ? state.home.items.concat(result.value.items) : result.value.items;
    state.home = {
      status: items.length === 0 ? "empty" : "ready",
      items,
      nextCursor: result.value.nextCursor,
      total: result.value.total,
      error: null,
      canRetry: false,
    };
    diagnostic("info", "flow.catalog-ready", { operation: "home", itemCount: items.length });
    present();
  }

  async function runSearch(query, { append = false } = {}) {
    const normalized = typeof query === "string" ? query.trim() : "";
    if (state.route === "player") player.close("back");
    state.route = "search";
    if (!normalized) {
      cancelOperation("empty-search");
      state.search = { status: "idle", query: "", items: [], nextCursor: null, total: 0, error: null, canRetry: false };
      present();
      return;
    }
    const entry = beginOperation(append ? "search-more" : "search");
    state.search = {
      ...state.search,
      status: append ? "loading-more" : "loading",
      query: normalized,
      error: null,
      canRetry: false,
      items: append ? state.search.items : [],
    };
    present();
    const cursor = append ? state.search.nextCursor : null;
    const result = await withRetry(entry, (signal) => catalog.search({ query: normalized, cursor, signal }));
    if (!current(entry)) return;
    complete(entry);
    if (!result.ok) {
      if (errorCode(result) === "cancelled") return;
      state.search = { ...state.search, status: "error", error: result.error, canRetry: userCanRetry(result.error) };
      diagnostic("error", "flow.catalog-failed", { operation: "search", code: errorCode(result) });
      present();
      return;
    }
    const items = append ? state.search.items.concat(result.value.items) : result.value.items;
    state.search = {
      status: items.length === 0 ? "empty" : "ready",
      query: normalized,
      items,
      nextCursor: result.value.nextCursor,
      total: result.value.total,
      error: null,
      canRetry: false,
    };
    diagnostic("info", "flow.catalog-ready", { operation: "search", itemCount: items.length });
    present();
  }

  async function loadDetails(videoId, origin) {
    if (typeof videoId !== "string" || !videoId) return;
    const entry = beginOperation("details");
    if (state.route === "player") player.close("back");
    state.route = "details";
    state.details = { status: "loading", item: null, error: null, origin: origin || "home", videoId, canRetry: false };
    present();
    const result = await withRetry(entry, (signal) => catalog.details({ videoId, signal }));
    if (!current(entry)) return;
    complete(entry);
    if (!result.ok) {
      if (errorCode(result) === "cancelled") return;
      state.details = { ...state.details, status: "error", error: result.error, canRetry: userCanRetry(result.error) };
      diagnostic("error", "flow.details-failed", { code: errorCode(result) });
      present();
      return;
    }
    state.details = { ...state.details, status: "ready", item: result.value, error: null, canRetry: false };
    diagnostic("info", "flow.details-ready", { live: result.value.isLive });
    present();
  }

  async function startPlayback(videoId, title) {
    if (typeof videoId !== "string" || !videoId) return;
    player.close("source-replaced");
    const entry = beginOperation("playback");
    state.route = "player";
    state.playback = {
      status: "resolving",
      videoId,
      title: typeof title === "string" ? title : "",
      snapshot: player.snapshot(),
      error: null,
      canRetry: false,
      controlsVisible: true,
      sourceSummary: null,
    };
    present();
    let refreshes = 0;
    let result;

    while (current(entry)) {
      result = await withRetry(entry, (signal) => playbackSources.resolve({ videoId, signal }));
      if (!current(entry)) return;
      if (!result.ok) {
        if (result.error.code === "source-expired" && refreshes === 0) {
          refreshes += 1;
          diagnostic("warn", "flow.source-refresh", { stage: "resolve", attempt: refreshes });
          continue;
        }
        break;
      }
      state.playback = {
        ...state.playback,
        status: "starting",
        sourceSummary: {
          kind: result.value.kind,
          manifest: result.value.manifest,
          advertising: result.value.advertising,
          qualityCount: result.value.qualities.length,
        },
      };
      present();
      const opened = await player.open(result.value);
      if (!current(entry)) return;
      if (!opened.ok && opened.error.code === "source-expired" && refreshes === 0) {
        refreshes += 1;
        diagnostic("warn", "flow.source-refresh", { stage: "open", attempt: refreshes });
        continue;
      }
      result = opened;
      break;
    }

    if (!current(entry)) return;
    complete(entry);
    if (!result || !result.ok) {
      const failure = result || { error: { code: "unknown", operation: "playback" } };
      if (errorCode(failure) === "cancelled") return;
      state.playback = { ...state.playback, status: "error", error: failure.error, canRetry: userCanRetry(failure.error), controlsVisible: true };
      diagnostic("error", "flow.playback-failed", { code: errorCode(failure) });
      present();
      return;
    }
    state.playback = { ...state.playback, status: "playing", snapshot: result.value, error: null, canRetry: false };
    diagnostic("info", "flow.playback-started", state.playback.sourceSummary || {});
    present();
  }

  function leavePlayer() {
    cancelOperation("leave-player");
    player.close("back");
    state.route = "details";
    state.playback = { ...state.playback, status: "idle", error: null, controlsVisible: true };
    present();
  }

  function goBack() {
    if (state.route === "player") {
      if (state.playback.controlsVisible) {
        state.playback = { ...state.playback, controlsVisible: false };
        present();
      } else {
        leavePlayer();
      }
      return;
    }
    cancelOperation("back");
    if (state.route === "details") {
      state.route = state.details.origin === "search" ? "search" : "home";
      present();
      return;
    }
    if (state.route === "search") {
      if (state.home.status === "idle") loadHome();
      else {
        state.route = "home";
        present();
      }
    }
  }

  function playerCommand(command) {
    const result = player.command(command);
    if (!result.ok) {
      diagnostic("warn", "flow.player-command-failed", { code: result.error.code });
      return;
    }
    state.playback = { ...state.playback, controlsVisible: true, snapshot: result.value };
    present();
  }

  function retryCurrent() {
    if (state.route === "home") return loadHome();
    if (state.route === "search") return runSearch(state.search.query);
    if (state.route === "details") return loadDetails(state.details.videoId, state.details.origin);
    if (state.route === "player") return startPlayback(state.playback.videoId, state.playback.title);
  }

  function dispatch(intent) {
    if (!running || !intent || typeof intent.type !== "string") return;
    switch (intent.type) {
      case "OPEN_HOME":
        if (state.route === "player") player.close("back");
        cancelOperation("open-home");
        state.route = "home";
        if (state.home.status === "idle" || state.home.status === "loading") loadHome();
        else present();
        break;
      case "OPEN_SEARCH":
        if (state.route === "player") player.close("back");
        cancelOperation("open-search");
        state.route = "search";
        present();
        break;
      case "SEARCH":
        runSearch(intent.query);
        break;
      case "LOAD_MORE":
        if (state.route === "home" && state.home.nextCursor) loadHome({ append: true });
        if (state.route === "search" && state.search.nextCursor) runSearch(state.search.query, { append: true });
        break;
      case "OPEN_VIDEO":
        loadDetails(intent.videoId, state.route === "search" ? "search" : "home");
        break;
      case "PLAY":
        startPlayback(intent.videoId || (state.details.item && state.details.item.videoId), intent.title || (state.details.item && state.details.item.title));
        break;
      case "TOGGLE_PLAY":
        playerCommand(state.playback.snapshot.state === "playing" || state.playback.snapshot.state === "buffering" ? "pause" : "play");
        break;
      case "SEEK":
        playerCommand({ type: "seekBy", offsetMs: intent.offsetMs });
        break;
      case "SHOW_CONTROLS":
        state.playback = { ...state.playback, controlsVisible: true };
        present();
        break;
      case "REPLAY":
        startPlayback(state.playback.videoId, state.playback.title);
        break;
      case "RETRY":
        retryCurrent();
        break;
      case "BACK":
        goBack();
        break;
      default:
        diagnostic("warn", "flow.intent-unknown", { type: intent.type.slice(0, 40) });
    }
  }

  function onNavigation(effect) {
    if (effect.type === "back") return dispatch({ type: "BACK" });
    if (effect.type === "direction" && state.route === "player" && !state.playback.controlsVisible) {
      return dispatch({ type: "SHOW_CONTROLS" });
    }
    const item = navigationItems.get(effect.id);
    if (!item) return;
    if (effect.type === "activate" && typeof item.activate === "function") item.activate();
    if (effect.type === "submit-input" && typeof item.submit === "function") item.submit();
  }

  function closeTerminalPlayer(reason) {
    Promise.resolve().then(() => {
      const snapshot = player.snapshot();
      if (snapshot.state === reason) player.close(reason);
    });
  }

  return Object.freeze({
    start() {
      if (running) return;
      running = true;
      unsubscribeNavigation = navigation.subscribe(onNavigation);
      unsubscribePlayer = player.subscribe((snapshot) => {
        state.playback = { ...state.playback, snapshot };
        if (state.route !== "player") return;
        if (snapshot.state === "ended") {
          closeTerminalPlayer("ended");
          state.playback = { ...state.playback, status: "ended", snapshot, error: null, canRetry: false, controlsVisible: true };
        } else if (snapshot.state === "error") {
          closeTerminalPlayer("error");
          state.playback = { ...state.playback, status: "error", snapshot, error: snapshot.error, canRetry: userCanRetry(snapshot.error), controlsVisible: true };
        }
        present();
      });
      diagnostic("info", "flow.started", { route: "home" });
      loadHome();
    },
    dispatch,
    snapshot() {
      return cloneView(state);
    },
    stop(reason = "app-stop") {
      if (!running) return;
      running = false;
      cancelOperation(reason);
      if (unsubscribeNavigation) unsubscribeNavigation();
      if (unsubscribePlayer) unsubscribePlayer();
      unsubscribeNavigation = null;
      unsubscribePlayer = null;
      navigation.dispose();
      player.close("app-stop");
      if (typeof renderer.dispose === "function") renderer.dispose();
      diagnostic("info", "flow.stopped", { reason: String(reason).slice(0, 40) });
    },
  });
}
