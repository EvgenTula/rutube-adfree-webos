const EVENT_NAMES = Object.freeze([
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

function initialState() {
  return {
    currentTimeSeconds: 0,
    durationSeconds: Number.NaN,
    volume: 1,
    muted: false,
    paused: true,
    ended: false,
    readyState: 0,
    seekableRanges: [],
    nativeErrorCode: null,
  };
}

/** In-memory implementation of the platform-media seam for behavior tests. */
export function createFakeMediaAdapter(options = {}) {
  const listeners = new Map(EVENT_NAMES.map((name) => [name, new Set()]));
  const state = initialState();
  const calls = {
    load: 0,
    play: 0,
    pause: 0,
    seek: 0,
    setVolume: 0,
    setMuted: 0,
    unload: 0,
  };
  let sourceUrl = null;

  function subscribe(name, listener) {
    const eventListeners = listeners.get(name);
    if (!eventListeners) throw new Error(`Unsupported fake media event: ${name}`);
    eventListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      eventListeners.delete(listener);
    };
  }

  function emit(name, patch = {}) {
    const eventListeners = listeners.get(name);
    if (!eventListeners) throw new Error(`Unsupported fake media event: ${name}`);
    Object.assign(state, patch);
    for (const listener of Array.from(eventListeners)) listener(patch);
  }

  return {
    eventNames: EVENT_NAMES,
    state,
    calls,
    subscribe,
    emit,
    load(url) {
      calls.load += 1;
      sourceUrl = url;
      Object.assign(state, initialState());
    },
    play() {
      calls.play += 1;
      if (options.playError) return Promise.reject(options.playError);
      if (typeof options.playResult === "function") return options.playResult();
      return Promise.resolve();
    },
    pause() {
      calls.pause += 1;
      state.paused = true;
    },
    seek(seconds) {
      calls.seek += 1;
      state.currentTimeSeconds = seconds;
    },
    setVolume(volume) {
      calls.setVolume += 1;
      if (options.setVolumeError) throw options.setVolumeError;
      state.volume = volume;
    },
    setMuted(muted) {
      calls.setMuted += 1;
      if (options.setMutedError) throw options.setMutedError;
      state.muted = muted;
    },
    read() {
      return {
        currentTimeSeconds: state.currentTimeSeconds,
        durationSeconds: state.durationSeconds,
        volume: state.volume,
        muted: state.muted,
        paused: state.paused,
        ended: state.ended,
        readyState: state.readyState,
        seekableRanges: state.seekableRanges.map((range) => range.slice()),
        nativeErrorCode: state.nativeErrorCode,
      };
    },
    unload() {
      calls.unload += 1;
      sourceUrl = null;
      Object.assign(state, initialState());
    },
    listenerCount() {
      let count = 0;
      for (const eventListeners of listeners.values()) count += eventListeners.size;
      return count;
    },
    hasSource() {
      return sourceUrl !== null;
    },
  };
}
