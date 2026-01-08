import { formatRelativeTime } from "../utils/time.js";

const DEFAULT_REPLY_STATE = {
  items: [],
  loading: false,
  error: "",
  isOpen: false,
  hasLoaded: false,
  submitting: false,
};

function replyItem(reply) {
  const item = document.createElement("div");
  item.className = "reply-item";

  const meta = document.createElement("div");
  meta.className = "reply-meta";

  const name = document.createElement("span");
  name.className = "reply-name";
  name.textContent = "Anonymous";

  const time = document.createElement("time");
  time.setAttribute("datetime", reply.created_at);
  time.dataset.createdAt = reply.created_at;
  time.textContent = formatRelativeTime(reply.created_at);

  meta.appendChild(name);
  meta.appendChild(time);

  const content = document.createElement("p");
  content.className = "reply-content";
  content.textContent = reply.content;

  item.appendChild(meta);
  item.appendChild(content);

  return item;
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
  let focusReplyId = "";
  const cardCache = new Map();

  const getReplyState = (state, confessionId) =>
    state.repliesByConfession?.[confessionId] || DEFAULT_REPLY_STATE;

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

  const updateReplyFormState = (entry, state, replyState) => {
    const trimmed = entry.replyInput.value.trim();
    const hasContent = trimmed.length > 0;
    const canSubmit =
      hasContent &&
      !replyState.loading &&
      !replyState.submitting &&
      !state.configError &&
      !state.authError &&
      !state.authLoading &&
      state.isAuthReady &&
      !!state.userId;

    entry.replySubmit.disabled = !canSubmit;
    entry.replyInput.disabled = replyState.submitting || !!state.configError;
  };

  const syncRepliesUI = (entry, state) => {
    const replyState = getReplyState(state, entry.confessionId);
    const replyCount = replyState.items.length;
    const isOpen = replyState.isOpen;

    entry.replyPanel.classList.toggle("is-hidden", !isOpen);
    entry.replyToggle.disabled = !!state.configError;
    entry.replyCompose.disabled = !!state.configError;

    let toggleLabel = "View replies";
    if (replyState.loading) {
      toggleLabel = "Loading replies...";
    } else if (replyState.hasLoaded) {
      toggleLabel = isOpen
        ? `Hide replies (${replyCount})`
        : `View replies (${replyCount})`;
    } else if (isOpen) {
      toggleLabel = "Hide replies";
    }
    entry.replyToggle.textContent = toggleLabel;

    if (!isOpen) {
      entry.replyStatus.textContent = "";
      entry.replyList.innerHTML = "";
      return;
    }

    let statusMessage = "";
    if (state.configError) {
      statusMessage = state.configError;
    } else if (state.authError) {
      statusMessage = state.authError;
    } else if (replyState.error) {
      statusMessage = replyState.error;
    } else if (replyState.loading) {
      statusMessage = "Loading replies...";
    } else if (replyState.hasLoaded && replyCount === 0) {
      statusMessage = "No replies yet.";
    }

    entry.replyStatus.textContent = statusMessage;
    entry.replyStatus.dataset.tone = replyState.error ? "error" : "";

    if (replyState.hasLoaded) {
      const fragment = document.createDocumentFragment();
      replyState.items.forEach((reply) => {
        fragment.appendChild(replyItem(reply));
      });
      entry.replyList.innerHTML = "";
      entry.replyList.appendChild(fragment);
    } else {
      entry.replyList.innerHTML = "";
    }

    updateReplyFormState(entry, state, replyState);
  };

  const createConfessionCard = (confession) => {
    const card = document.createElement("article");
    card.className = "confession-card";

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

    const actionsRow = document.createElement("div");
    actionsRow.className = "confession-actions";

    const replyToggle = document.createElement("button");
    replyToggle.className = "ghost small reply-toggle";
    replyToggle.type = "button";
    replyToggle.textContent = "View replies";

    const replyCompose = document.createElement("button");
    replyCompose.className = "ghost small reply-compose";
    replyCompose.type = "button";
    replyCompose.textContent = "Reply";

    actionsRow.appendChild(replyToggle);
    actionsRow.appendChild(replyCompose);

    const replyPanel = document.createElement("div");
    replyPanel.className = "reply-panel is-hidden";

    const replyStatus = document.createElement("p");
    replyStatus.className = "reply-status helper";

    const replyList = document.createElement("div");
    replyList.className = "reply-list";

    const replyForm = document.createElement("form");
    replyForm.className = "reply-form";

    const replyInput = document.createElement("textarea");
    replyInput.className = "reply-input";
    replyInput.name = "reply";
    replyInput.rows = 3;
    replyInput.placeholder = "Write a reply.";
    replyInput.required = true;

    const replyActions = document.createElement("div");
    replyActions.className = "reply-form-actions";

    const replySubmit = document.createElement("button");
    replySubmit.className = "primary small";
    replySubmit.type = "submit";
    replySubmit.textContent = "Send";

    replyActions.appendChild(replySubmit);
    replyForm.appendChild(replyInput);
    replyForm.appendChild(replyActions);

    replyPanel.appendChild(replyStatus);
    replyPanel.appendChild(replyList);
    replyPanel.appendChild(replyForm);

    card.appendChild(meta);
    card.appendChild(content);
    card.appendChild(actionsRow);
    card.appendChild(replyPanel);

    const entry = {
      confessionId: confession.id,
      card,
      name,
      time,
      content,
      replyToggle,
      replyCompose,
      replyPanel,
      replyStatus,
      replyList,
      replyForm,
      replyInput,
      replySubmit,
    };

    replyToggle.addEventListener("click", () => actions.toggleReplies(entry.confessionId));
    replyCompose.addEventListener("click", async () => {
      focusReplyId = entry.confessionId;
      await actions.openReplies(entry.confessionId);
    });

    replyInput.addEventListener("input", () => {
      const state = store.getState();
      updateReplyFormState(entry, state, getReplyState(state, entry.confessionId));
    });

    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const contentValue = replyInput.value.trim();
      if (!contentValue) {
        replyInput.focus();
        return;
      }

      const result = await actions.submitReply({
        confessionId: entry.confessionId,
        content: contentValue,
      });

      if (result.ok) {
        replyInput.value = "";
        const state = store.getState();
        updateReplyFormState(entry, state, getReplyState(state, entry.confessionId));
      } else {
        replyInput.focus();
      }
    });

    return entry;
  };

  const updateConfessionCard = (entry, confession, isNew, state) => {
    entry.card.classList.toggle("is-new", isNew);
    const rawName = (confession.name || confession.display_name || "").trim();
    entry.name.textContent = rawName || "Anonymous";
    entry.time.setAttribute("datetime", confession.created_at);
    entry.time.dataset.createdAt = confession.created_at;
    entry.time.textContent = formatRelativeTime(confession.created_at);
    entry.content.textContent = confession.content;
    syncRepliesUI(entry, state);
  };

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
      statusText.textContent = "No vents yet. Be the first.";
      status.classList.remove("active");
    } else if (state.loading) {
      statusText.textContent = "Loading global vents...";
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
        let entry = cardCache.get(item.id);
        if (!entry) {
          entry = createConfessionCard(item);
          cardCache.set(item.id, entry);
        }
        updateConfessionCard(entry, item, newIds.has(item.id), state);
        fragment.appendChild(entry.card);
      });
      list.innerHTML = "";
      list.appendChild(fragment);
    }

    lastRenderedIds = ids;
    cardCache.forEach((entry, id) => {
      if (!ids.has(id)) {
        cardCache.delete(id);
      }
    });

    if (state.confessions.length > 0) {
      meta.textContent = `${state.confessions.length} vents in view.`;
    }

    refreshButton.disabled = state.loading || state.loadingMore;
    loadingIndicator.classList.toggle("is-active", state.loadingMore);

    if (focusReplyId) {
      const entry = cardCache.get(focusReplyId);
      if (entry && !entry.replyPanel.classList.contains("is-hidden")) {
        entry.replyInput.focus();
        entry.replyInput.setSelectionRange(entry.replyInput.value.length, entry.replyInput.value.length);
      }
      focusReplyId = "";
    }
  };

  store.subscribe(render);

  const tick = () => updateRelativeTimes(list);
  tick();
  const interval = setInterval(tick, 60000);

  return () => clearInterval(interval);
}
