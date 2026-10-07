import { inspectHlsManifest } from "./hls.js";

const TV_REFERER = "https://rutube.ru/tv-release/webos.server/webos/";
const PLAY_OPTIONS_QUERY = `no_404=true&referer=${encodeURIComponent(TV_REFERER)}&pver=v2&ver=34.0.0&ac_client=linux_tv`;

function failure(code, extra) {
  return { ok: false, error: Object.assign({ code, operation: "playback-source" }, extra || {}) };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_error) {
    return false;
  }
}

function hlsUrl(value) {
  if (!validHttpUrl(value)) return false;
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".m3u8");
  } catch (_error) {
    return false;
  }
}

function expiryFrom(raw, url) {
  let value = raw.expires_at || raw.expire_at || null;
  if (!value) {
    try {
      value = new URL(url).searchParams.get("expire");
    } catch (_error) {
      value = null;
    }
  }
  if (!value) return null;

  if (typeof value === "number" || /^[0-9]+$/.test(String(value))) {
    let timestamp = Number(value);
    if (timestamp < 100000000000) timestamp *= 1000;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasPlayerAdvertising(raw) {
  if (Array.isArray(raw.advert) && raw.advert.length > 0) return true;
  return Boolean(raw.yast || raw.yast_live_online || raw.advert_url);
}

function accessReason(blockingRule) {
  const code = blockingRule && typeof blockingRule.code === "string"
    ? blockingRule.code.toLowerCase().replace(/[^a-z0-9-]/g, "")
    : "";
  const supported = ["deleted", "geo", "private", "rights-holder", "rights_holder", "vpn"];
  return supported.indexOf(code) === -1 ? "unavailable" : code.replace("_", "-");
}

function drmScheme(raw) {
  const scheme = typeof raw.drm_type === "string" ? raw.drm_type.toLowerCase() : "";
  return ["widevine", "playready", "fairplay", "aes-128"].indexOf(scheme) === -1
    ? "unknown"
    : scheme;
}

function unsupportedCodecFamilies(codecs) {
  const unsupported = [];
  for (const codec of codecs) {
    const normalized = codec.toLowerCase();
    if (/^avc[13](\.|$)/.test(normalized) || /^mp4a\.40\./.test(normalized)) continue;
    let family = "unknown";
    if (/^(hev1|hvc1)/.test(normalized)) family = "hevc";
    else if (/^(vp09|vp9)/.test(normalized)) family = "vp9";
    else if (/^av01/.test(normalized)) family = "av1";
    else if (/^(ac-3|ec-3)/.test(normalized)) family = "dolby-audio";
    else if (/^opus/.test(normalized)) family = "opus";
    if (unsupported.indexOf(family) === -1) unsupported.push(family);
  }
  return unsupported;
}

function chooseSource(raw) {
  if (raw.live_streams !== undefined && !isObject(raw.live_streams)) {
    return failure("malformed-response");
  }
  if (raw.video_balancer !== undefined && !isObject(raw.video_balancer)) {
    return failure("malformed-response");
  }

  const live = isObject(raw.live_streams) && Array.isArray(raw.live_streams.hls)
    ? raw.live_streams.hls.find((entry) => isObject(entry) && entry.is_video !== false && hlsUrl(entry.url))
    : null;
  if (live) {
    return { ok: true, value: { kind: "live", url: live.url, seekable: live.is_dvr === true } };
  }

  const balancer = isObject(raw.video_balancer) ? raw.video_balancer : {};
  const url = hlsUrl(balancer.m3u8) ? balancer.m3u8 : hlsUrl(balancer.default) ? balancer.default : null;
  if (url) {
    return { ok: true, value: { kind: "vod", url, seekable: true } };
  }
  return failure("source-missing");
}

/** Resolve a fresh ephemeral RUTUBE playback capability for every call. */
export function createPlaybackSources({ http, clock = () => new Date() }) {
  if (!http || typeof http.json !== "function") {
    throw new TypeError("PlaybackSources requires an HTTP adapter");
  }

  return Object.freeze({
    async resolve({ videoId, signal } = {}) {
      if (typeof videoId !== "string" || !videoId.trim()) {
        return failure("invalid-input");
      }
      const path = `/api/play/options/${encodeURIComponent(videoId.trim())}/?${PLAY_OPTIONS_QUERY}`;
      const response = await http.json({ path, signal, operation: "play-options" });
      if (!response.ok) {
        if (response.error.code === "http" && response.error.status === 402) return failure("paid");
        if (response.error.code === "http" && (response.error.status === 401 || response.error.status === 403)) {
          return failure("unavailable", { reason: "access-denied" });
        }
        return response;
      }

      const raw = response.value;
      if (!isObject(raw)) return failure("malformed-response");
      if (raw.is_paid === true || raw.requires_entitlement === true) return failure("paid");
      if (raw.has_video === false || raw.blocking_rule || raw.is_available === false) {
        return failure("unavailable", { reason: accessReason(raw.blocking_rule) });
      }
      if (raw.drm_token || raw.drm_type || raw.has_drm === true) {
        return failure("drm-unsupported", { scheme: drmScheme(raw) });
      }

      const selected = chooseSource(raw);
      if (!selected.ok) return selected;
      const expires = expiryFrom(raw, selected.value.url);
      if (expires && expires.getTime() <= clock().getTime()) {
        return failure("source-expired");
      }

      let qualities = [];
      let codecs = [];
      let advertising = hasPlayerAdvertising(raw) ? "player-side" : "none-observed";
      const warnings = [];

      if (typeof http.text === "function") {
        const manifestResponse = await http.text({ url: selected.value.url, signal, operation: "manifest-probe" });
        if (!manifestResponse.ok) {
          if (manifestResponse.error.code === "cancelled") return manifestResponse;
          if (
            manifestResponse.error.code !== "cors-rejected" &&
            manifestResponse.error.code !== "opaque-network"
          ) return manifestResponse;
          advertising = advertising === "player-side" ? advertising : "unknown";
          warnings.push(`manifest-probe-${manifestResponse.error.code}`);
        } else {
          const inspection = inspectHlsManifest(manifestResponse.value);
          if (!inspection.ok) return inspection;
          if (inspection.value.encrypted) {
            return failure("drm-unsupported", { scheme: inspection.value.encryptionMethod });
          }
          qualities = inspection.value.qualities;
          codecs = inspection.value.codecs;
          const unsupported = unsupportedCodecFamilies(codecs);
          if (unsupported.length > 0) {
            return failure("manifest-unsupported", { formats: unsupported });
          }
          if (inspection.value.advertisingMarked) advertising = "manifest-marked";
          if (inspection.value.unknownTags.length > 0) {
            if (advertising === "none-observed") advertising = "unknown";
            warnings.push("manifest-unknown-markers");
          }
          if (inspection.value.markers.indexOf("discontinuity") !== -1) {
            warnings.push("manifest-discontinuity");
          }
        }
      } else {
        advertising = advertising === "player-side" ? advertising : "unknown";
        warnings.push("manifest-probe-unavailable");
      }

      const source = {
        kind: selected.value.kind,
        url: selected.value.url,
        manifest: "hls",
        seekable: selected.value.seekable,
        qualities,
        codecs,
        advertising,
        warnings,
      };
      if (typeof raw.duration === "number" && Number.isFinite(raw.duration) && raw.duration >= 0) {
        source.durationMs = raw.duration;
      }
      if (expires) source.expiresAt = expires.toISOString();
      return { ok: true, value: source };
    },
  });
}
