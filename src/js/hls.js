function parseAttributes(value) {
  const attributes = {};
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
  let match = pattern.exec(value);
  while (match) {
    const raw = match[2];
    attributes[match[1].toUpperCase()] = raw.charAt(0) === '"' ? raw.slice(1, -1) : raw;
    match = pattern.exec(value);
  }
  return attributes;
}

function unique(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

const KNOWN_TAGS = new Set([
  "#EXT-X-BITRATE",
  "#EXT-X-BYTERANGE",
  "#EXT-X-CONTENT-STEERING",
  "#EXT-X-CUE-IN",
  "#EXT-X-CUE-OUT",
  "#EXT-X-DATERANGE",
  "#EXT-X-DEFINE",
  "#EXT-X-DISCONTINUITY",
  "#EXT-X-DISCONTINUITY-SEQUENCE",
  "#EXT-X-ENDLIST",
  "#EXT-X-GAP",
  "#EXT-X-I-FRAME-STREAM-INF",
  "#EXT-X-I-FRAMES-ONLY",
  "#EXT-X-INDEPENDENT-SEGMENTS",
  "#EXT-X-KEY",
  "#EXT-X-MAP",
  "#EXT-X-MEDIA",
  "#EXT-X-MEDIA-SEQUENCE",
  "#EXT-X-PART",
  "#EXT-X-PART-INF",
  "#EXT-X-PLAYLIST-TYPE",
  "#EXT-X-PRELOAD-HINT",
  "#EXT-X-PROGRAM-DATE-TIME",
  "#EXT-X-RENDITION-REPORT",
  "#EXT-X-SERVER-CONTROL",
  "#EXT-X-SESSION-DATA",
  "#EXT-X-SESSION-KEY",
  "#EXT-X-SKIP",
  "#EXT-X-SCTE35",
  "#EXT-X-START",
  "#EXT-X-STREAM-INF",
  "#EXT-X-TARGETDURATION",
  "#EXT-X-VERSION",
]);

function tagName(line) {
  const separator = line.indexOf(":");
  return (separator === -1 ? line : line.slice(0, separator)).toUpperCase();
}

function markerName(line) {
  const upper = line.toUpperCase();
  if (upper.indexOf("#EXT-X-DATERANGE:") === 0) {
    const attributes = parseAttributes(line.slice(line.indexOf(":") + 1));
    const label = `${attributes.CLASS || ""} ${attributes.ID || ""}`;
    const structuralSignal = Object.keys(attributes).some((key) => key.indexOf("SCTE35") === 0);
    if (structuralSignal || /(?:^|[._:\s-])(ad|ads|advert|advertising|cue|scte)(?:$|[._:\s-])/i.test(label)) {
      return "daterange";
    }
  }
  if (upper.indexOf("#EXT-X-CUE-OUT") === 0) return "cue-out";
  if (upper.indexOf("#EXT-X-CUE-IN") === 0) return "cue-in";
  if (upper.indexOf("#EXT-OATCLS-SCTE35") === 0 || upper.indexOf("#EXT-X-SCTE35") === 0) return "scte35";
  if (upper === "#EXT-X-DISCONTINUITY") return "discontinuity";
  return null;
}

/** Inspect HLS metadata. The returned `original` is byte-for-byte caller input. */
export function inspectHlsManifest(manifest) {
  if (typeof manifest !== "string" || !/^\s*#EXTM3U(?:\r?\n|$)/.test(manifest)) {
    return { ok: false, error: { code: "manifest-unsupported", operation: "manifest-inspection" } };
  }

  const lines = manifest.split(/\r?\n/).map((line) => line.trim());
  const byQuality = new Map();
  const codecs = [];
  const markers = [];
  const unknownTags = [];
  const audioTracks = [];
  let encryptionMethod = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = markerName(line);
    if (marker && markers.indexOf(marker) === -1) {
      markers.push(marker);
    }
    if (
      line.toUpperCase().indexOf("#EXT-X-") === 0 &&
      !KNOWN_TAGS.has(tagName(line)) &&
      unknownTags.indexOf(tagName(line)) === -1
    ) {
      unknownTags.push(tagName(line));
    }

    if (line.toUpperCase().indexOf("#EXT-X-KEY:") === 0) {
      const attributes = parseAttributes(line.slice(line.indexOf(":") + 1));
      if (attributes.METHOD && attributes.METHOD.toUpperCase() !== "NONE") {
        encryptionMethod = attributes.METHOD.toUpperCase();
      }
    }

    if (line.toUpperCase().indexOf("#EXT-X-MEDIA:") === 0) {
      const media = parseAttributes(line.slice(line.indexOf(":") + 1));
      if ((media.TYPE || "").toUpperCase() === "AUDIO") {
        audioTracks.push({
          groupId: media["GROUP-ID"] || "",
          name: media.NAME || "",
          language: media.LANGUAGE || "",
          isDefault: (media.DEFAULT || "").toUpperCase() === "YES",
          autoSelect: (media.AUTOSELECT || "").toUpperCase() === "YES",
        });
      }
    }

    if (line.toUpperCase().indexOf("#EXT-X-STREAM-INF:") !== 0) {
      continue;
    }
    const attributes = parseAttributes(line.slice(line.indexOf(":") + 1));
    const resolution = /^([0-9]+)x([0-9]+)$/i.exec(attributes.RESOLUTION || "");
    const qualityCodecs = attributes.CODECS ? attributes.CODECS.split(",").map((codec) => codec.trim()).filter(Boolean) : [];
    const quality = {
      width: resolution ? Number(resolution[1]) : null,
      height: resolution ? Number(resolution[2]) : null,
      bandwidth: Number(attributes.BANDWIDTH) || 0,
      frameRate: Number(attributes["FRAME-RATE"]) || 0,
      codecs: qualityCodecs,
      mirrorCount: 1,
    };
    const key = [quality.width, quality.height, quality.bandwidth, quality.frameRate, qualityCodecs.join("|")].join(":");
    if (byQuality.has(key)) {
      byQuality.get(key).mirrorCount += 1;
    } else {
      byQuality.set(key, quality);
    }
    codecs.push(...qualityCodecs);
  }

  const advertisingMarkers = markers.filter((marker) => marker !== "discontinuity");
  return {
    ok: true,
    value: {
      original: manifest,
      qualities: Array.from(byQuality.values()),
      codecs: unique(codecs),
      markers,
      unknownTags,
      audioTracks,
      advertisingMarked: advertisingMarkers.length > 0,
      encrypted: encryptionMethod !== null,
      encryptionMethod,
    },
  };
}
