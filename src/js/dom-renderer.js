function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function node(documentRef, tag, className, text) {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function safeImage(element, url) {
  if (!url) return;
  element.src = url;
  element.referrerPolicy = "no-referrer";
  element.loading = "lazy";
  element.alt = "";
}

function duration(milliseconds, live) {
  if (live) return "ПРЯМОЙ ЭФИР";
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
  const total = Math.floor(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function errorMessage(error) {
  const code = error && error.code;
  if (code === "unavailable") {
    const unavailable = {
      geo: "Видео недоступно в вашем регионе.",
      vpn: "RUTUBE не разрешил воспроизведение для текущего сетевого подключения.",
      private: "Это частное видео.",
      deleted: "Видео удалено.",
      "rights-holder": "Видео ограничено правообладателем.",
      "access-denied": "Доступ к этому видео закрыт.",
    };
    return unavailable[error.reason] || "Это видео недоступно.";
  }
  const messages = {
    offline: "Нет подключения к сети.",
    "opaque-network": "RUTUBE сейчас недоступен или запрос заблокирован сетью.",
    timeout: "RUTUBE не ответил вовремя.",
    http: "Сервис RUTUBE вернул ошибку.",
    "malformed-response": "Формат ответа RUTUBE изменился.",
    paid: "Платный контент пока не поддерживается.",
    "drm-unsupported": "Защищённое видео пока не поддерживается.",
    "source-missing": "Для видео не найден совместимый поток.",
    "source-expired": "Срок действия ссылки на видео истёк.",
    "manifest-unsupported": "Формат потока не поддерживается на этом устройстве.",
    "autoplay-rejected": "Телевизор не разрешил автоматический запуск.",
    "playback-failed": "Не удалось воспроизвести видео.",
  };
  return messages[code] || "Произошла непредвиденная ошибка.";
}

function button(documentRef, label, className, activate) {
  const element = node(documentRef, "button", className, label);
  element.type = "button";
  element.addEventListener("click", activate);
  return element;
}

function shellHeader(documentRef, route, dispatch) {
  const header = node(documentRef, "header", "topbar");
  const brand = button(documentRef, "RUTUBE · TV", "brand-button", () => dispatch({ type: "OPEN_HOME" }));
  brand.dataset.focusId = "nav-home";
  header.appendChild(brand);
  const nav = node(documentRef, "nav", "topnav");
  nav.setAttribute("aria-label", "Основная навигация");
  const home = button(documentRef, "Главная", route === "home" ? "nav-button is-current" : "nav-button", () => dispatch({ type: "OPEN_HOME" }));
  home.dataset.focusId = "nav-home-link";
  if (route === "home") home.setAttribute("aria-current", "page");
  const search = button(documentRef, "Поиск", route === "search" ? "nav-button is-current" : "nav-button", () => dispatch({ type: "OPEN_SEARCH" }));
  search.dataset.focusId = "nav-search";
  if (route === "search") search.setAttribute("aria-current", "page");
  nav.appendChild(home);
  nav.appendChild(search);
  header.appendChild(nav);
  return header;
}

function collectFocus(root, route, defaultId, isRoot) {
  const items = Array.from(root.querySelectorAll("[data-focus-id]")).map((element) => {
    const item = {
      id: element.dataset.focusId,
      element,
      activate: () => element.click(),
      submit: () => {
        if (element.form && typeof element.form.requestSubmit === "function") element.form.requestSubmit();
      },
    };
    if (element.dataset.row !== undefined && element.dataset.column !== undefined) {
      item.row = Number(element.dataset.row);
      item.column = Number(element.dataset.column);
    }
    if (element.dataset.dismissTo) item.dismissTo = element.dataset.dismissTo;
    return item;
  });
  return { route, items, defaultId, isRoot };
}

function renderNotice(documentRef, host, title, message, actionLabel, action, urgent = false) {
  const panel = node(documentRef, "section", "notice-panel");
  panel.setAttribute("role", urgent ? "alert" : "status");
  panel.setAttribute("aria-live", urgent ? "assertive" : "polite");
  panel.appendChild(node(documentRef, "h2", "notice-title", title));
  panel.appendChild(node(documentRef, "p", "notice-copy", message));
  if (actionLabel) {
    const actionButton = button(documentRef, actionLabel, "primary-button", action);
    actionButton.dataset.focusId = "notice-action";
    panel.appendChild(actionButton);
  }
  host.appendChild(panel);
}

function renderCards(documentRef, host, items, dispatch, nextCursor, loadingMore) {
  const grid = node(documentRef, "section", "card-grid");
  grid.setAttribute("aria-label", "Видео");
  items.forEach((item, index) => {
    const card = button(documentRef, "", "video-card", () => dispatch({ type: "OPEN_VIDEO", videoId: item.videoId }));
    card.dataset.focusId = `video-${index}`;
    card.dataset.row = String(Math.floor(index / 5) + 1);
    card.dataset.column = String(index % 5);
    const artwork = node(documentRef, "span", "card-artwork");
    if (item.thumbnailUrl) {
      const image = node(documentRef, "img", "card-image");
      safeImage(image, item.thumbnailUrl);
      artwork.appendChild(image);
    } else {
      artwork.appendChild(node(documentRef, "span", "card-placeholder", "▶"));
    }
    const badge = duration(item.durationMs, item.isLive);
    if (badge) artwork.appendChild(node(documentRef, "span", item.isLive ? "card-badge live" : "card-badge", badge));
    card.appendChild(artwork);
    card.appendChild(node(documentRef, "span", "card-title", item.title));
    grid.appendChild(card);
  });
  host.appendChild(grid);
  if (nextCursor) {
    const more = button(documentRef, loadingMore ? "Загрузка…" : "Показать ещё", "secondary-button load-more", () => dispatch({ type: "LOAD_MORE" }));
    more.disabled = loadingMore;
    more.dataset.focusId = "load-more";
    more.dataset.row = String(Math.ceil(items.length / 5) + 1);
    more.dataset.column = "0";
    host.appendChild(more);
  }
}

function renderHome(documentRef, root, view, dispatch) {
  root.appendChild(shellHeader(documentRef, "home", dispatch));
  const content = node(documentRef, "main", "content-screen");
  content.appendChild(node(documentRef, "p", "eyebrow", "БЕЗ ЛИШНИХ ПРЕРЫВАНИЙ"));
  content.appendChild(node(documentRef, "h1", "screen-title", "Смотреть сейчас"));
  if (view.home.status === "loading") renderNotice(documentRef, content, "Загружаем каталог", "Получаем свежую подборку RUTUBE…");
  else if (view.home.status === "error") renderNotice(documentRef, content, "Каталог недоступен", errorMessage(view.home.error), view.home.canRetry ? "Повторить" : null, () => dispatch({ type: "RETRY" }), true);
  else if (view.home.status === "empty") renderNotice(documentRef, content, "Здесь пока пусто", "RUTUBE не вернул видео для главной страницы.");
  else renderCards(documentRef, content, view.home.items, dispatch, view.home.nextCursor, view.home.status === "loading-more");
  root.appendChild(content);
  const defaultId = view.home.status === "loading-more" && view.home.items.length
    ? `video-${view.home.items.length - 1}`
    : view.home.items.length ? "video-0" : "nav-search";
  return collectFocus(root, "home", defaultId, true);
}

function renderSearch(documentRef, root, view, dispatch) {
  root.appendChild(shellHeader(documentRef, "search", dispatch));
  const content = node(documentRef, "main", "content-screen search-screen");
  content.appendChild(node(documentRef, "h1", "screen-title", "Поиск"));
  const form = node(documentRef, "form", "search-form");
  const input = node(documentRef, "input", "search-input");
  input.type = "search";
  input.value = view.search.query;
  input.placeholder = "Название видео, канал или тема";
  input.setAttribute("aria-label", "Поисковый запрос");
  input.autocomplete = "off";
  input.dataset.focusId = "search-input";
  input.dataset.dismissTo = "search-submit";
  input.dataset.row = "0";
  input.dataset.column = "0";
  const submit = button(documentRef, "Найти", "primary-button search-submit", () => {});
  submit.type = "submit";
  submit.dataset.focusId = "search-submit";
  submit.dataset.row = "0";
  submit.dataset.column = "1";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    dispatch({ type: "SEARCH", query: input.value });
  });
  form.appendChild(input);
  form.appendChild(submit);
  content.appendChild(form);
  if (view.search.status === "loading") renderNotice(documentRef, content, "Ищем", `Запрос: «${view.search.query}»`);
  else if (view.search.status === "error") renderNotice(documentRef, content, "Поиск не выполнен", errorMessage(view.search.error), view.search.canRetry ? "Повторить" : null, () => dispatch({ type: "RETRY" }), true);
  else if (view.search.status === "empty") renderNotice(documentRef, content, "Ничего не найдено", "Попробуйте изменить запрос.");
  else if (view.search.items.length) renderCards(documentRef, content, view.search.items, dispatch, view.search.nextCursor, view.search.status === "loading-more");
  else content.appendChild(node(documentRef, "p", "search-hint", "Введите запрос. Экранная клавиатура webOS появится автоматически."));
  root.appendChild(content);
  const defaultId = view.search.status === "loading-more" && view.search.items.length
    ? `video-${view.search.items.length - 1}`
    : "search-input";
  return collectFocus(root, "search", defaultId, false);
}

function renderDetails(documentRef, root, view, dispatch) {
  root.appendChild(shellHeader(documentRef, "details", dispatch));
  const content = node(documentRef, "main", "details-screen");
  if (view.details.status === "loading") renderNotice(documentRef, content, "Открываем видео", "Получаем описание…");
  else if (view.details.status === "error") renderNotice(documentRef, content, "Видео недоступно", errorMessage(view.details.error), view.details.canRetry ? "Повторить" : null, () => dispatch({ type: "RETRY" }), true);
  else if (view.details.item) {
    const item = view.details.item;
    const artwork = node(documentRef, "section", "details-artwork");
    if (item.thumbnailUrl) {
      const image = node(documentRef, "img", "details-image");
      safeImage(image, item.thumbnailUrl);
      artwork.appendChild(image);
    } else artwork.appendChild(node(documentRef, "span", "details-placeholder", "▶"));
    content.appendChild(artwork);
    const copy = node(documentRef, "section", "details-copy");
    copy.appendChild(node(documentRef, "p", "eyebrow", item.isLive ? "ПРЯМОЙ ЭФИР" : duration(item.durationMs, false)));
    copy.appendChild(node(documentRef, "h1", "details-title", item.title));
    if (item.authorName) copy.appendChild(node(documentRef, "p", "details-author", item.authorName));
    if (item.description) copy.appendChild(node(documentRef, "p", "details-description", item.description));
    const play = button(documentRef, item.isLive ? "Смотреть эфир" : "Смотреть", "primary-button play-button", () => dispatch({ type: "PLAY", videoId: item.videoId, title: item.title }));
    play.dataset.focusId = "play";
    copy.appendChild(play);
    content.appendChild(copy);
  }
  root.appendChild(content);
  return collectFocus(root, "details", view.details.item ? "play" : "notice-action", false);
}

function formatPosition(milliseconds) {
  return duration(milliseconds, false) || "0:00";
}

function renderPlayer(documentRef, root, view, dispatch) {
  const playback = view.playback;
  const snapshot = playback.snapshot || {};
  const layer = node(documentRef, "main", playback.controlsVisible ? "player-layer controls-visible" : "player-layer controls-hidden");
  layer.addEventListener("click", () => dispatch({ type: "SHOW_CONTROLS" }));
  if (playback.status === "resolving" || playback.status === "starting") {
    renderNotice(documentRef, layer, playback.status === "resolving" ? "Ищем поток" : "Запускаем видео", playback.title || "Подождите…");
  } else if (playback.status === "error") {
    renderNotice(documentRef, layer, "Ошибка воспроизведения", errorMessage(playback.error), playback.canRetry ? "Повторить" : null, () => dispatch({ type: "RETRY" }), true);
  } else if (playback.status === "ended") {
    renderNotice(documentRef, layer, "Просмотр завершён", playback.title, "Смотреть ещё раз", () => dispatch({ type: "REPLAY" }));
  } else if (playback.controlsVisible) {
    const top = node(documentRef, "div", "player-top");
    top.appendChild(node(documentRef, "h1", "player-title", playback.title));
    top.appendChild(node(documentRef, "span", "quality-label", "Качество: авто · native HLS"));
    layer.appendChild(top);
    const controls = node(documentRef, "section", "player-controls");
    controls.setAttribute("aria-label", "Управление воспроизведением");
    const back = button(documentRef, "−15 сек", "control-button", () => dispatch({ type: "SEEK", offsetMs: -15000 }));
    back.dataset.focusId = "seek-back";
    back.dataset.column = "0";
    const toggle = button(documentRef, snapshot.state === "playing" || snapshot.state === "buffering" ? "Пауза" : "Продолжить", "control-button primary", () => dispatch({ type: "TOGGLE_PLAY" }));
    toggle.dataset.focusId = "toggle-play";
    toggle.dataset.column = "1";
    const forward = button(documentRef, "+30 сек", "control-button", () => dispatch({ type: "SEEK", offsetMs: 30000 }));
    forward.dataset.focusId = "seek-forward";
    forward.dataset.column = "2";
    controls.appendChild(back);
    controls.appendChild(toggle);
    controls.appendChild(forward);
    if (snapshot.seekable === false) {
      back.disabled = true;
      forward.disabled = true;
    }
    const progress = node(documentRef, "div", "progress-row");
    const ratio = snapshot.durationMs > 0 ? Math.min(100, snapshot.positionMs / snapshot.durationMs * 100) : 0;
    const track = node(documentRef, "div", "progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Позиция воспроизведения");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.round(ratio)));
    const fill = node(documentRef, "span", "progress-fill");
    fill.style.width = `${ratio}%`;
    track.appendChild(fill);
    progress.appendChild(node(documentRef, "span", "time-label", formatPosition(snapshot.positionMs)));
    progress.appendChild(track);
    progress.appendChild(node(documentRef, "span", "time-label", snapshot.durationMs ? formatPosition(snapshot.durationMs) : "LIVE"));
    controls.appendChild(progress);
    layer.appendChild(controls);
  }
  root.appendChild(layer);
  const focus = collectFocus(root, "player", playback.status === "error" || playback.status === "ended" ? "notice-action" : "toggle-play", false);
  focus.captureDirections = playback.controlsVisible === false;
  return focus;
}

/** DOM renderer. Remote text is assigned through textContent and safe URL fields only. */
export function createDomRenderer({ root, documentRef = document } = {}) {
  if (!root || !documentRef) throw new TypeError("DOM renderer requires a root element");
  return Object.freeze({
    render(view, dispatch) {
      clear(root);
      root.className = `app route-${view.route}`;
      if (view.route === "home") return renderHome(documentRef, root, view, dispatch);
      if (view.route === "search") return renderSearch(documentRef, root, view, dispatch);
      if (view.route === "details") return renderDetails(documentRef, root, view, dispatch);
      return renderPlayer(documentRef, root, view, dispatch);
    },
    dispose() {
      clear(root);
    },
  });
}
