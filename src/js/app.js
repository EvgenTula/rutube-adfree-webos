import { createDiagnostics } from "./diagnostics.js";

const DEBUG_STORAGE_KEY = "rutube-adfree.debug";

function isDebugEnabled() {
  try {
    const queryValue = new URLSearchParams(window.location.search).get("debug");
    return queryValue === "1" || localStorage.getItem(DEBUG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

async function loadBuildInfo() {
  const response = await fetch("build-info.json");
  if (!response.ok) {
    throw new Error(`build info request failed with status ${response.status}`);
  }
  return response.json();
}

async function start() {
  const debug = isDebugEnabled();
  let buildInfo = { version: "unknown", commit: "unknown" };

  try {
    buildInfo = await loadBuildInfo();
  } catch {
    // The app remains usable if metadata display cannot be refreshed.
  }

  const diagnostics = createDiagnostics({
    app: buildInfo,
    debug,
  });

  document.querySelector("#app-version").textContent = buildInfo.version;
  document.querySelector("#debug-status").textContent = debug
    ? "расширенный безопасный режим"
    : "безопасный режим";

  diagnostics.info("app.ready", {
    screen: "phase-0-baseline",
    debug,
  });

  window.addEventListener("error", (event) => {
    diagnostics.error("app.unhandled-error", { error: event.error ?? event.message });
  });
  window.addEventListener("unhandledrejection", (event) => {
    diagnostics.error("app.unhandled-rejection", { error: event.reason });
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.keyCode === 461) {
    window.close();
  }
});

start();
