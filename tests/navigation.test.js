import assert from "node:assert/strict";
import test from "node:test";

import { createNavigation } from "../src/js/navigation.js";

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    emit(name, event = {}) {
      const listener = listeners.get(name);
      if (listener) listener(event);
    },
    count() { return listeners.size; },
  };
}

function element(tagName = "BUTTON") {
  return {
    tagName,
    focused: 0,
    blurred: 0,
    focus() { this.focused += 1; },
    blur() { this.blurred += 1; },
  };
}

function key(keyCode, extras = {}) {
  return {
    keyCode,
    prevented: 0,
    stopped: 0,
    preventDefault() { this.prevented += 1; },
    stopPropagation() { this.stopped += 1; },
    ...extras,
  };
}

test("navigation uses deterministic grid movement and restores focus per route", () => {
  const target = eventTarget();
  let now = 1000;
  const navigation = createNavigation({ eventTarget: target, clock: () => now });
  const items = [
    { id: "a", element: element(), row: 0, column: 0 },
    { id: "b", element: element(), row: 0, column: 1 },
    { id: "c", element: element(), row: 1, column: 0 },
  ];
  navigation.mount({ route: "home", items, defaultId: "a", isRoot: true });
  target.emit("keydown", key(39));
  assert.equal(navigation.snapshot().focusedId, "b");
  target.emit("keydown", key(40));
  assert.equal(navigation.snapshot().focusedId, "c");

  navigation.mount({ route: "details", items: [{ id: "play", element: element(), row: 0, column: 0 }], defaultId: "play" });
  assert.equal(navigation.snapshot().focusedId, "play");
  navigation.mount({ route: "home", items, defaultId: "a", isRoot: true });
  assert.equal(navigation.snapshot().focusedId, "c");
});

test("navigation throttles held arrows, ignores held OK, and reports activation", () => {
  const target = eventTarget();
  let now = 1000;
  const effects = [];
  const navigation = createNavigation({ eventTarget: target, clock: () => now, repeatIntervalMs: 100 });
  navigation.subscribe((effect) => effects.push(effect));
  navigation.mount({
    route: "home",
    defaultId: "a",
    items: [
      { id: "a", element: element(), row: 0, column: 0 },
      { id: "b", element: element(), row: 0, column: 1 },
      { id: "c", element: element(), row: 0, column: 2 },
    ],
  });
  target.emit("keydown", key(39));
  now += 40;
  target.emit("keydown", key(39, { repeat: true }));
  assert.equal(navigation.snapshot().focusedId, "b");
  now += 100;
  target.emit("keydown", key(39, { repeat: true }));
  assert.equal(navigation.snapshot().focusedId, "c");
  target.emit("keydown", key(13, { repeat: true }));
  target.emit("keydown", key(13));
  assert.equal(effects.filter((effect) => effect.type === "activate").length, 1);
});

test("text editing keeps horizontal cursor keys and Back dismisses input first", () => {
  const target = eventTarget();
  const effects = [];
  const input = element("INPUT");
  const navigation = createNavigation({ eventTarget: target });
  navigation.subscribe((effect) => effects.push(effect));
  const submit = element();
  navigation.mount({ route: "search", defaultId: "query", items: [
    { id: "query", element: input, row: 0, column: 0, dismissTo: "submit" },
    { id: "submit", element: submit, row: 0, column: 1 },
  ] });
  target.emit("keydown", key(39, { target: input }));
  assert.equal(navigation.snapshot().focusedId, "query");
  target.emit("keydown", key(13, { target: input }));
  assert.equal(effects.at(-1).type, "submit-input");
  target.emit("keydown", key(461, { target: input }));
  assert.equal(input.blurred, 1);
  assert.equal(submit.focused, 1);
  assert.equal(navigation.snapshot().focusedId, "submit");
  assert.equal(effects.at(-1).type, "dismiss-input");
  assert.equal(effects.some((effect) => effect.type === "back"), false);
});

test("pointer mode, Back precedence, platform fallback, and dispose are explicit", () => {
  const target = eventTarget();
  const effects = [];
  let platformBackCalls = 0;
  const navigation = createNavigation({ eventTarget: target, platformBack: () => { platformBackCalls += 1; } });
  navigation.subscribe((effect) => effects.push(effect));
  const a = element();
  navigation.mount({ route: "details", defaultId: "a", items: [{ id: "a", element: a }] });
  target.emit("mousemove");
  assert.equal(navigation.snapshot().mode, "pointer");
  target.emit("keydown", key(461, { target: a }));
  assert.equal(effects.at(-1).type, "back");
  navigation.mount({ route: "home", defaultId: "a", items: [{ id: "a", element: a }], isRoot: true });
  target.emit("keydown", key(461, { target: a }));
  assert.equal(platformBackCalls, 1);
  assert.equal(effects.at(-1).type, "platform-back");
  navigation.dispose();
  navigation.dispose();
  assert.equal(target.count(), 0);
});

test("a captured direction is emitted even when an overlay has no focus targets", () => {
  const target = eventTarget();
  const effects = [];
  const navigation = createNavigation({ eventTarget: target });
  navigation.subscribe((effect) => effects.push(effect));
  navigation.mount({ route: "player", items: [], captureDirections: true });
  const left = key(37);
  target.emit("keydown", left);
  assert.equal(left.prevented, 1);
  assert.deepEqual(effects.at(-1), { type: "direction", direction: "left", moved: false });
  navigation.dispose();
});
