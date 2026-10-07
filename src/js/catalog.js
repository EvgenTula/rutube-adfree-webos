const HOME_PATH = "/api/v2/video/recommendation/main";
const SEARCH_PATH = "/api/search/combined/video_playlist";
const DEFAULT_PAGE_SIZE = 20;

function error(code, operation) {
  return { ok: false, error: { code, operation } };
}

function asNonNegativeNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function pageFromCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return 1;
  }
  const page = Number(cursor);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function unwrapVideo(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (entry.object && typeof entry.object === "object") {
    if (entry.content_type && entry.content_type !== "video") {
      return null;
    }
    return entry.object;
  }
  if (entry.content_type && entry.content_type !== "video") {
    return null;
  }
  return entry;
}

function safeRemoteUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch (_error) {
    return null;
  }
}

function thumbnailFrom(video) {
  const candidates = [
    video.thumbnail_url,
    video.thumbnailUrl,
    video.thumbnail,
    video.picture_url,
  ];
  for (const candidate of candidates) {
    const direct = safeRemoteUrl(candidate);
    if (direct) return direct;
    if (candidate && typeof candidate === "object") {
      const nested = safeRemoteUrl(candidate.url || candidate.src);
      if (nested) return nested;
    }
  }
  return null;
}

function normalizeSummary(entry) {
  const video = unwrapVideo(entry);
  if (!video || typeof video.id !== "string" || !video.id || typeof video.title !== "string") {
    return null;
  }
  return {
    videoId: video.id,
    title: video.title,
    durationMs: Math.round(asNonNegativeNumber(video.duration, 0) * 1000),
    thumbnailUrl: thumbnailFrom(video),
    isLive: video.is_livestream === true,
    isOnAir: video.is_on_air === true,
    isAdult: video.is_adult === true,
  };
}

function normalizePage(raw, requestedPage, operation) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.results)) {
    return error("malformed-response", operation);
  }

  const items = [];
  for (const entry of raw.results) {
    const normalized = normalizeSummary(entry);
    if (normalized) {
      items.push(normalized);
    } else if (!entry || !entry.content_type || entry.content_type === "video") {
      return error("malformed-response", operation);
    }
  }

  const page = asNonNegativeNumber(raw.current_page, asNonNegativeNumber(raw.page, requestedPage));
  const pageSize = asNonNegativeNumber(raw.per_page, DEFAULT_PAGE_SIZE);
  const total = asNonNegativeNumber(raw.count, items.length);
  return {
    ok: true,
    value: {
      items,
      page,
      pageSize,
      total,
      nextCursor: raw.has_next === true || (typeof raw.next === "string" && raw.next) ? String(page + 1) : null,
      previousCursor: page > 1 && raw.previous ? String(page - 1) : null,
    },
  };
}

function normalizeDetails(raw) {
  const video = raw && raw.result && raw.result.video ? raw.result.video : raw;
  if (!video || typeof video !== "object" || typeof video.id !== "string" || !video.id || typeof video.title !== "string") {
    return error("malformed-response", "catalog-details");
  }
  const author = video.author && typeof video.author === "object" ? video.author : null;
  return {
    ok: true,
    value: {
      videoId: video.id,
      title: video.title,
      description: typeof video.description === "string" ? video.description : "",
      authorName: author && typeof author.name === "string" ? author.name : "",
      durationMs: Math.round(asNonNegativeNumber(video.duration, 0) * 1000),
      thumbnailUrl: thumbnailFrom(video),
      isLive: video.is_livestream === true,
      isOnAir: video.is_on_air === true,
      isLicensed: video.is_licensed === true,
      isPaid: video.is_paid === true,
    },
  };
}

/** Create the normalized catalog boundary used by screens and AppFlow. */
export function createCatalog({ http }) {
  if (!http || typeof http.json !== "function") {
    throw new TypeError("Catalog requires an HTTP adapter");
  }

  return Object.freeze({
    async home({ cursor, signal } = {}) {
      const page = pageFromCursor(cursor);
      if (page === null) {
        return error("invalid-input", "catalog-home");
      }
      const path = `${HOME_PATH}?limit=${DEFAULT_PAGE_SIZE}&page=${page}&show_hidden_videos=False&show_user_hidden_videos=False`;
      const result = await http.json({ path, signal, operation: "catalog-home" });
      return result.ok ? normalizePage(result.value, page, "catalog-home") : result;
    },

    async search({ query, cursor, signal } = {}) {
      const normalizedQuery = typeof query === "string" ? query.trim() : "";
      const page = pageFromCursor(cursor);
      if (!normalizedQuery || page === null) {
        return error("invalid-input", "catalog-search");
      }
      const path = `${SEARCH_PATH}?query=${encodeURIComponent(normalizedQuery)}&limit=${DEFAULT_PAGE_SIZE}&page=${page}`;
      const result = await http.json({ path, signal, operation: "catalog-search" });
      return result.ok ? normalizePage(result.value, page, "catalog-search") : result;
    },

    async details({ videoId, signal } = {}) {
      if (typeof videoId !== "string" || !videoId.trim()) {
        return error("invalid-input", "catalog-details");
      }
      const path = `/api/video/${encodeURIComponent(videoId.trim())}/`;
      const result = await http.json({ path, signal, operation: "catalog-details" });
      return result.ok ? normalizeDetails(result.value) : result;
    },
  });
}
