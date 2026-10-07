import { createAppFlow } from "./app-flow.js";
import { createCatalog } from "./catalog.js";
import { createDiagnostics } from "./diagnostics.js";
import { createDomRenderer } from "./dom-renderer.js";
import { createNavigation } from "./navigation.js";
import { createNativeMediaAdapter, createPlayer } from "./player.js";
import { createPlaybackSources } from "./playback-sources.js";
import { createRutubeHttp } from "./rutube-http.js";

const DEBUG_STORAGE_KEY = "rutube-adfree.debug";

function isDebugEnabled() {
  try {
    const queryValue = new URLSearchParams(window.location.search).get("debug");
    return queryValue === "1" || localStorage.getItem(DEBUG_STORAGE_KEY) === "true";
  } catch (_error) {
    return false;
  }
}

function useDevelopmentProxy() {
  return window.location.protocol === "http:" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
}

async function loadBuildInfo() {
  const response = await fetch("build-info.json");
  if (!response.ok) throw new Error("build info request failed");
  return response.json();
}

function platformBack() {
  try {
    if (window.webOS && typeof window.webOS.platformBack === "function") {
      window.webOS.platformBack();
      return;
    }
  } catch (_error) {
    // The safe desktop/simulator fallback is closing only this application window.
  }
  window.close();
}

async function start() {
  const debug = isDebugEnabled();
  let buildInfo = { version: "unknown", commit: "unknown" };
  try {
    buildInfo = await loadBuildInfo();
  } catch (_error) {
    // Runtime functionality does not depend on the optional build label.
  }

  const diagnostics = createDiagnostics({ app: buildInfo, debug });
  const http = createRutubeHttp({
    baseUrl: useDevelopmentProxy() ? `${window.location.origin}/rutube/` : "https://rutube.ru/",
  });
  const catalog = createCatalog({ http });
  const playbackSources = createPlaybackSources({ http });
  const video = document.querySelector("#player-media");
  const root = document.querySelector("#app");
  const player = createPlayer({ media: createNativeMediaAdapter(video), diagnostics });
  const navigation = createNavigation({ eventTarget: document, platformBack });
  const renderer = createDomRenderer({ root });
  const flow = createAppFlow({
    catalog,
    playbackSources,
    player,
    navigation,
    renderer,
    diagnostics,
  });

  window.addEventListener("error", (event) => {
    diagnostics.error("app.unhandled-error", { error: event.error || event.message });
  });
  window.addEventListener("unhandledrejection", (event) => {
    diagnostics.error("app.unhandled-rejection", { error: event.reason });
  });
  window.addEventListener("pagehide", () => flow.stop("app-stop"), { once: true });
  flow.start();
}

start();
