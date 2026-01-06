import { formatRelativeTime } from "../utils/time.js";

function confessionCard(confession, isNew) {
  const card = document.createElement("article");
  card.className = `confession-card${isNew ? " is-new" : ""}`;

  const meta = document.createElement("div");
  meta.className = "confession-meta";

  const name = document.createElement("span");
  name.className = "confession-name";
  const rawName = (confession.name || confession.display_name || "").trim();
  name.textContent = rawName || "Anonymous";

  const time = document.createElement("time");
  time.setAttribute("datetime", confession.created_at);
  time.dataset.createdAt = confession.created_at;
  time.textContent = formatRelativeTime(confession.created_at);

  meta.appendChild(name);
  meta.appendChild(time);

  const content = document.createElement("p");
  content.className = "confession-content";
  content.textContent = confession.content;

  card.appendChild(meta);
  card.appendChild(content);

  return card;
}

function updateRelativeTimes(container) {
  const now = new Date();
  container.querySelectorAll("time[data-created-at]").forEach((node) => {
    node.textContent = formatRelativeTime(node.dataset.createdAt, now);
  });
}

export function createFeedUI({ store, actions }) {
  const list = document.getElementById("feed-list");
  const status = document.getElementById("feed-status");
  const statusText = document.getElementById("feed-status-text");
  const retryButton = document.getElementById("retry-feed");
  const refreshButton = document.getElementById("refresh-feed");
  const sentinel = document.getElementById("feed-sentinel");
  const meta = document.getElementById("feed-meta");
  const loadingIndicator = document.getElementById("feed-loading");

  let lastRenderedIds = new Set();
  let isRequestingNext = false;

  retryButton.addEventListener("click", () => actions.loadInitialConfessions());
  refreshButton.addEventListener("click", () => actions.loadInitialConfessions());

  const requestNextPage = async () => {
    const state = store.getState();
    if (
      isRequestingNext ||
      state.loadingMore ||
      state.loading ||
      !state.page.hasMore ||
      state.configError
    ) {
      return;
    }
    isRequestingNext = true;
    await actions.loadMoreConfessions();
    isRequestingNext = false;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          requestNextPage();
        }
      });
    },
    { rootMargin: "600px" }
  );

  observer.observe(sentinel);

  const render = (state) => {
    if (state.configError) {
      statusText.textContent = state.configError;
      status.classList.add("active");
      refreshButton.disabled = true;
      loadingIndicator.classList.remove("is-active");
      meta.textContent = "Waiting for configuration.";
      return;
    }

    const ids = new Set(state.confessions.map((item) => item.id));
    const newIds = new Set();
    state.confessions.forEach((item) => {
      if (!lastRenderedIds.has(item.id)) {
        newIds.add(item.id);
      }
    });

    if (state.confessions.length === 0 && !state.loading) {
      list.innerHTML = "";
      statusText.textContent = "No confessions yet. Be the first.";
      status.classList.remove("active");
    } else if (state.loading) {
      statusText.textContent = "Loading global confessions...";
      status.classList.remove("active");
    } else if (state.error) {
      statusText.textContent = state.error;
      status.classList.add("active");
    } else if (!state.page.hasMore) {
      statusText.textContent = "You reached the end of the feed.";
      status.classList.remove("active");
    } else {
      statusText.textContent = "";
      status.classList.remove("active");
    }

    if (state.confessions.length > 0) {
      const fragment = document.createDocumentFragment();
      state.confessions.forEach((item) => {
        fragment.appendChild(confessionCard(item, newIds.has(item.id)));
      });
      list.innerHTML = "";
      list.appendChild(fragment);
    }

    lastRenderedIds = ids;

    if (state.confessions.length > 0) {
      meta.textContent = `${state.confessions.length} confessions in view.`;
    }

    refreshButton.disabled = state.loading || state.loadingMore;
    loadingIndicator.classList.toggle("is-active", state.loadingMore);
  };

  store.subscribe(render);

  const tick = () => updateRelativeTimes(list);
  tick();
  const interval = setInterval(tick, 60000);

  return () => clearInterval(interval);
}
