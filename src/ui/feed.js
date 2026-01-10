import { formatRelativeTime } from "../utils/time.js";

const DEFAULT_REPLY_STATE = {
  items: [],
  loading: false,
  loadingMore: false,
  error: "",
  isOpen: false,
  hasLoaded: false,
  submitting: false,
  isComposerOpen: false,
  page: {
    offset: 0,
    limit: 0,
    hasMore: true,
  },
};

function replyItem(reply) {
  const item = document.createElement("div");
  item.className = "reply-item";

  const meta = document.createElement("div");
  meta.className = "reply-meta";

  const name = document.createElement("span");
  name.className = "reply-name";
  const rawName = (reply.reply_name || "").trim();
  name.textContent = rawName || "Anonymous";

  const time = document.createElement("time");
  time.setAttribute("datetime", reply.created_at);
  time.dataset.createdAt = reply.created_at;
  time.textContent = formatRelativeTime(reply.created_at);

  meta.appendChild(name);
  meta.appendChild(time);

  const content = document.createElement("p");
  content.className = "reply-content";

  const expandButton = document.createElement("button");
  expandButton.className = "reply-expand";
  expandButton.type = "button";
  expandButton.textContent = "See more";

  const contentWrapper = document.createElement("span");
  contentWrapper.className = "reply-content-wrapper";
  contentWrapper.appendChild(content);
  contentWrapper.appendChild(expandButton);

  const fullContent = reply.content || "";
  const replyWordCount = getWordCount(fullContent);
  if (replyWordCount <= MAX_REPLY_WORDS) {
    content.textContent = fullContent;
    expandButton.classList.add("is-hidden");
  } else {
    content.textContent = truncateWords(fullContent, MAX_REPLY_WORDS);
    expandButton.classList.remove("is-hidden");
  }

  expandButton.addEventListener("click", () => {
    content.textContent = fullContent;
    expandButton.classList.add("is-hidden");
  });

  item.appendChild(meta);
  item.appendChild(contentWrapper);

  return item;
}

function updateRelativeTimes(container) {
  const now = new Date();
  container.querySelectorAll("time[data-created-at]").forEach((node) => {
    node.textContent = formatRelativeTime(node.dataset.createdAt, now);
  });
}

const MAX_CONTENT_WORDS = 60;
const MAX_REPLY_WORDS = 60;

function normalizeLineBreaks(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function getWordCount(text) {
  if (typeof text !== "string") {
    return 0;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function truncateWords(text, maxWords) {
  if (typeof text !== "string") {
    return "";
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }
  let count = 0;
  let result = "";
  const tokens = text.split(/(\s+)/);
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (/\S+/.test(token)) {
      count += 1;
      if (count > maxWords) {
        break;
      }
    }
    result += token;
  }
  return `${result.trimEnd()}... `;
}

function getReplyCountSeed(confession) {
  if (!confession || typeof confession !== "object") {
    return null;
  }

  const directCount = confession.reply_count ?? confession.replyCount;
  if (Number.isFinite(directCount)) {
    return directCount;
  }

  const embedded = confession.confession_replies;
  if (Array.isArray(embedded)) {
    const embeddedCount = embedded[0]?.count;
    if (Number.isFinite(embeddedCount)) {
      return embeddedCount;
    }
    if (embedded.length === 0) {
      return 0;
    }
  }

  return null;
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

  const sentinelMargin = 600;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          requestNextPage();
        }
      });
    },
    { rootMargin: `${sentinelMargin}px` }
  );

  observer.observe(sentinel);

  let isScrollQueued = false;
  const isSentinelNearViewport = () => {
    if (!sentinel) {
      return false;
    }
    const rect = sentinel.getBoundingClientRect();
    return rect.top <= window.innerHeight + sentinelMargin && rect.bottom >= -sentinelMargin;
  };
  const handleScroll = () => {
    if (isScrollQueued) {
      return;
    }
    isScrollQueued = true;
    requestAnimationFrame(() => {
      isScrollQueued = false;
      if (isSentinelNearViewport()) {
        requestNextPage();
      }
    });
  };
  window.addEventListener("scroll", handleScroll, { passive: true });

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
    entry.replyNameInput.disabled = replyState.submitting || !!state.configError;
    entry.replyInput.placeholder =
      state.authLoading || !state.isAuthReady || !state.userId ? "Connecting..." : "Write a reply.";
  };

  const syncRepliesUI = (entry, state) => {
    const replyState = getReplyState(state, entry.confessionId);
    const seededCount = Number.isFinite(entry.replyCountSeed) ? entry.replyCountSeed : null;
    const replyCount = Number.isFinite(seededCount) ? seededCount : replyState.items.length;
    const showCount = Number.isFinite(replyCount);
    const isOpen = replyState.isOpen;

    entry.replyPanel.classList.toggle("is-hidden", !isOpen);
    entry.replyToggle.disabled = !!state.configError;
    entry.replyCompose.disabled = !!state.configError;
    entry.replyForm.classList.toggle("is-hidden", !isOpen || !replyState.isComposerOpen);
    entry.replyCompose.classList.toggle("is-hidden", isOpen && replyState.isComposerOpen);

    if (isOpen) {
      if (entry.replyCompose.parentElement !== entry.replyPanelActions) {
        entry.replyPanelActions.appendChild(entry.replyCompose);
      }
    } else if (entry.replyCompose.parentElement !== entry.actionsRow) {
      entry.actionsRow.appendChild(entry.replyCompose);
    }

    let toggleLabel = "View replies";
    if (replyState.loading) {
      toggleLabel = "Loading replies...";
    } else if (replyState.hasLoaded || showCount) {
      const countLabel = showCount ? ` (${replyCount})` : "";
      toggleLabel = isOpen ? `Hide replies${countLabel}` : `View replies${countLabel}`;
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
    } else if (state.authLoading || !state.isAuthReady || !state.userId) {
      statusMessage = "Connecting...";
    } else if (replyState.hasLoaded && replyCount === 0) {
      statusMessage = "No replies yet.";
    }

    entry.replyStatus.textContent = statusMessage;
    entry.replyStatus.dataset.tone = replyState.error ? "error" : "";

    const canLoadMore = replyState.hasLoaded && replyState.page?.hasMore;
    entry.replySeeMore.classList.toggle("is-hidden", !canLoadMore);
    entry.replySeeMore.disabled = replyState.loadingMore || replyState.loading || !!state.configError;
    entry.replySeeMore.textContent = replyState.loadingMore ? "Loading..." : "See more";

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

    const expandButton = document.createElement("button");
    expandButton.className = "confession-expand";
    expandButton.type = "button";
    expandButton.textContent = "See more";

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "confession-content-wrapper";
    contentWrapper.appendChild(content);
    contentWrapper.appendChild(expandButton);

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

    const replyPanelActions = document.createElement("div");
    replyPanelActions.className = "reply-panel-actions";

    const replySeeMore = document.createElement("button");
    replySeeMore.className = "ghost small reply-see-more";
    replySeeMore.type = "button";
    replySeeMore.textContent = "See more";

    const replyForm = document.createElement("form");
    replyForm.className = "reply-form";

    const replyNameField = document.createElement("label");
    replyNameField.className = "reply-name-field";

    const replyNameLabel = document.createElement("span");
    replyNameLabel.className = "reply-name-label";
    replyNameLabel.textContent = "Name (optional)";

    const replyNameInput = document.createElement("input");
    replyNameInput.className = "reply-name-input";
    replyNameInput.type = "text";
    replyNameInput.name = "replyName";
    replyNameInput.placeholder = "Anonymous";
    replyNameInput.autocomplete = "off";
    replyNameInput.maxLength = 24;

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
    replyNameField.appendChild(replyNameLabel);
    replyNameField.appendChild(replyNameInput);
    replyForm.appendChild(replyNameField);
    replyForm.appendChild(replyInput);
    replyForm.appendChild(replyActions);

    replyPanel.appendChild(replyStatus);
    replyPanel.appendChild(replyList);
    replyPanelActions.appendChild(replySeeMore);
    replyPanel.appendChild(replyPanelActions);
    replyPanel.appendChild(replyForm);

    card.appendChild(meta);
    card.appendChild(contentWrapper);
    card.appendChild(actionsRow);
    card.appendChild(replyPanel);

    const entry = {
      confessionId: confession.id,
      card,
      name,
      time,
      content,
      contentWrapper,
      expandButton,
      replyToggle,
      replyCompose,
      actionsRow,
      replyPanel,
      replyStatus,
      replyList,
      replyPanelActions,
      replySeeMore,
      replyForm,
      replyNameInput,
      replyInput,
      replySubmit,
    };

    replyToggle.addEventListener("click", () => actions.toggleReplies(entry.confessionId));
    replyCompose.addEventListener("click", async () => {
      focusReplyId = entry.confessionId;
      await actions.openReplyComposer(entry.confessionId);
    });
    replySeeMore.addEventListener("click", () => actions.loadMoreReplies(entry.confessionId));
    expandButton.addEventListener("click", () => {
      entry.isExpanded = true;
      entry.content.textContent = entry.contentNormalized || "";
      entry.expandButton.classList.add("is-hidden");
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
        replyName: replyNameInput.value,
      });

      if (result.ok) {
        replyInput.value = "";
        replyNameInput.value = "";
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
    if (entry.contentFull !== confession.content) {
      entry.contentFull = confession.content;
      entry.contentNormalized = normalizeLineBreaks(confession.content);
      entry.isExpanded = false;
    }
    const wordCount = getWordCount(entry.contentNormalized);
    if (entry.isExpanded || wordCount <= MAX_CONTENT_WORDS) {
      entry.content.textContent = entry.contentNormalized;
      entry.expandButton.classList.add("is-hidden");
    } else {
      entry.content.textContent = truncateWords(entry.contentNormalized, MAX_CONTENT_WORDS);
      entry.expandButton.classList.remove("is-hidden");
    }
    entry.replyCountSeed = getReplyCountSeed(confession);
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

    const totalCount = Number.isFinite(state.totalConfessions) ? state.totalConfessions : null;
    if (totalCount !== null) {
      meta.textContent = `There are ${totalCount} Global Vents.`;
    }

    refreshButton.disabled = state.loading || state.loadingMore;
    loadingIndicator.classList.toggle("is-active", state.loadingMore);

    if (focusReplyId) {
      const entry = cardCache.get(focusReplyId);
      if (
        entry &&
        !entry.replyPanel.classList.contains("is-hidden") &&
        !entry.replyForm.classList.contains("is-hidden")
      ) {
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

  return () => {
    clearInterval(interval);
    observer.disconnect();
    window.removeEventListener("scroll", handleScroll);
  };
}
