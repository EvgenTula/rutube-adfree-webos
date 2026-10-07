const KEY = Object.freeze({
  enter: 13,
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  back: 461,
  escape: 27,
});

const DIRECTION = Object.freeze({
  [KEY.left]: "left",
  [KEY.up]: "up",
  [KEY.right]: "right",
  [KEY.down]: "down",
});

function elementAvailable(item) {
  const element = item && item.element;
  return Boolean(
    element &&
    typeof element.focus === "function" &&
    element.disabled !== true &&
    element.hidden !== true,
  );
}

function editableElement(element) {
  if (!element) return false;
  const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || element.isContentEditable === true;
}

function center(item) {
  const element = item && item.element;
  if (element && typeof element.getBoundingClientRect === "function") {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  }
  if (item && Number.isFinite(item.row) && Number.isFinite(item.column)) {
    return { x: item.column * 100, y: item.row * 100 };
  }
  return { x: 0, y: 0 };
}

function scoreCandidate(origin, candidate, direction) {
  const from = center(origin);
  const to = center(candidate);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const primary = direction === "left" ? -dx
    : direction === "right" ? dx
      : direction === "up" ? -dy : dy;
  if (primary <= 0) return Number.POSITIVE_INFINITY;
  const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
  return primary * 10 + cross * 4 + Math.sqrt(dx * dx + dy * dy);
}

/** Deterministic focus and remote-input controller for one application surface. */
export function createNavigation({
  eventTarget = typeof document === "undefined" ? null : document,
  platformBack = null,
  clock = () => Date.now(),
  repeatIntervalMs = 110,
} = {}) {
  let model = { route: "root", items: [], defaultId: null };
  let currentId = null;
  let mode = "dpad";
  let disposed = false;
  let lastRepeatedMove = 0;
  const listeners = new Set();
  const restoreByRoute = new Map();

  function publish(effect) {
    for (const listener of Array.from(listeners)) listener(effect);
    return effect;
  }

  function itemById(id) {
    return model.items.find((item) => item.id === id) || null;
  }

  function focus(id, reason) {
    const item = itemById(id);
    if (!elementAvailable(item)) return false;
    currentId = item.id;
    restoreByRoute.set(model.route, currentId);
    item.element.focus();
    publish({ type: "focus", id: currentId, mode, reason });
    return true;
  }

  function firstAvailable() {
    const restored = restoreByRoute.get(model.route);
    if (restored && elementAvailable(itemById(restored))) return restored;
    if (model.defaultId && elementAvailable(itemById(model.defaultId))) return model.defaultId;
    const first = model.items.find(elementAvailable);
    return first ? first.id : null;
  }

  function move(direction) {
    const origin = itemById(currentId);
    if (!origin) return focus(firstAvailable(), "initial");
    const explicitId = origin.neighbors && origin.neighbors[direction];
    if (explicitId && focus(explicitId, "explicit")) return true;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of model.items) {
      if (candidate.id === origin.id || !elementAvailable(candidate)) continue;
      const candidateScore = scoreCandidate(origin, candidate, direction);
      if (candidateScore < bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    return best ? focus(best.id, "spatial") : false;
  }

  function keyCode(event) {
    return Number(event.keyCode || event.which || 0);
  }

  function prevent(event) {
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopPropagation === "function") event.stopPropagation();
  }

  function onKeyDown(event) {
    if (disposed) return;
    const code = keyCode(event);
    const direction = DIRECTION[code];
    const active = itemById(currentId);
    const editing = editableElement(event.target || (active && active.element));

    if (direction) {
      if (editing && (direction === "left" || direction === "right")) return;
      if (event.repeat) {
        const now = clock();
        if (now - lastRepeatedMove < repeatIntervalMs) {
          prevent(event);
          return;
        }
        lastRepeatedMove = now;
      } else {
        lastRepeatedMove = clock();
      }
      mode = "dpad";
      const moved = move(direction);
      if (moved || model.captureDirections) prevent(event);
      publish({ type: "direction", direction, moved });
      return;
    }

    if (code === KEY.enter) {
      if (event.repeat) return prevent(event);
      prevent(event);
      publish({ type: editing ? "submit-input" : "activate", id: currentId });
      return;
    }

    if (code === KEY.back || code === KEY.escape) {
      if (event.repeat) return prevent(event);
      prevent(event);
      if (editing) {
        if (typeof (event.target || active.element).blur === "function") {
          (event.target || active.element).blur();
        }
        if (active && active.dismissTo) focus(active.dismissTo, "input-dismiss");
        publish({ type: "dismiss-input", id: currentId });
        return;
      }
      if (model.isRoot === true && typeof platformBack === "function") {
        platformBack();
        publish({ type: "platform-back" });
        return;
      }
      publish({ type: "back" });
    }
  }

  function onPointerMove() {
    mode = "pointer";
  }

  function onFocusIn(event) {
    const match = model.items.find((item) => item.element === event.target);
    if (!match) return;
    currentId = match.id;
    restoreByRoute.set(model.route, currentId);
  }

  if (eventTarget && typeof eventTarget.addEventListener === "function") {
    eventTarget.addEventListener("keydown", onKeyDown);
    eventTarget.addEventListener("pointermove", onPointerMove);
    eventTarget.addEventListener("mousemove", onPointerMove);
    eventTarget.addEventListener("focusin", onFocusIn);
  }

  return Object.freeze({
    mount(nextModel = {}) {
      if (disposed) return { route: model.route, focusedId: null, mode };
      model = {
        route: typeof nextModel.route === "string" ? nextModel.route : "root",
        items: Array.isArray(nextModel.items) ? nextModel.items.slice() : [],
        defaultId: nextModel.defaultId || null,
        isRoot: nextModel.isRoot === true,
        captureDirections: nextModel.captureDirections === true,
      };
      const desired = firstAvailable();
      if (desired) focus(desired, "mount");
      else currentId = null;
      return { route: model.route, focusedId: currentId, mode };
    },
    handle(input) {
      const event = input || {};
      onKeyDown(event);
    },
    restore(location) {
      if (typeof location === "string") restoreByRoute.set(model.route, location);
      const desired = firstAvailable();
      if (desired) focus(desired, "restore");
      return { route: model.route, focusedId: currentId, mode };
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Navigation listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { route: model.route, focusedId: currentId, mode };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      if (eventTarget && typeof eventTarget.removeEventListener === "function") {
        eventTarget.removeEventListener("keydown", onKeyDown);
        eventTarget.removeEventListener("pointermove", onPointerMove);
        eventTarget.removeEventListener("mousemove", onPointerMove);
        eventTarget.removeEventListener("focusin", onFocusIn);
      }
      model = { route: "disposed", items: [], defaultId: null };
      currentId = null;
    },
  });
}
