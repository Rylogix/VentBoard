import { supabase } from "../data/supabase.js";
import { parseSupabaseTimestamp } from "../utils/time.js";
import {
  createConfession,
  deleteConfession,
  fetchConfessions,
  fetchLatestConfessionByUser,
  getConfigError,
  getPageSize,
} from "../data/confessionsApi.js";
import { createReply, fetchRepliesByConfession } from "../data/repliesApi.js";
import { containsSlur } from "../utils/moderation.js";
import { normalizeReplyName } from "../utils/replyName.js";

const DEFAULT_ERROR = "We could not reach the vent stream.";
const AUTH_ERROR = "Unable to connect. Refresh and try again.";
const DEFAULT_REPLY_STATE = {
  items: [],
  loading: false,
  error: "",
  isOpen: false,
  hasLoaded: false,
  submitting: false,
};

function normalizeName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function errorMessage(error, fallback = DEFAULT_ERROR) {
  if (!error) {
    return "";
  }
  return error.message || fallback;
}

function formatCooldown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function createActions(store) {
  const pageSize = getPageSize();
  const configError = getConfigError();
  const storageKey = (userId) => `confessionCooldown:${userId}`;

  if (configError) {
    store.setState({ configError });
  }

  const isRlsError = (error) => {
    const message = (error && error.message ? error.message : "").toLowerCase();
    return error?.code === "42501" || message.includes("row level security") || message.includes("permission");
  };

  const readStoredState = (userId) => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const writeStoredState = (userId, payload) => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(payload));
    } catch {
      // Ignore storage errors.
    }
  };

  const clearStoredState = (userId) => {
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
      // Ignore storage errors.
    }
  };

  const readRepliesState = (state, confessionId) => {
    if (!confessionId) {
      return DEFAULT_REPLY_STATE;
    }
    return state.repliesByConfession?.[confessionId] || DEFAULT_REPLY_STATE;
  };

  const writeRepliesState = (confessionId, updater) => {
    if (!confessionId) {
      return;
    }
    store.setState((current) => {
      const currentEntry = readRepliesState(current, confessionId);
      const nextEntry =
        typeof updater === "function" ? updater(currentEntry) : { ...currentEntry, ...updater };
      return {
        ...current,
        repliesByConfession: {
          ...(current.repliesByConfession || {}),
          [confessionId]: nextEntry,
        },
      };
    });
  };

  const applyCooldownFromRecord = (record, userId) => {
    if (!record || !record.created_at) {
      return;
    }
    const createdAtMs = parseSupabaseTimestamp(record.created_at).getTime();
    if (Number.isNaN(createdAtMs)) {
      return;
    }
    const cooldownEnd = createdAtMs + 60 * 60 * 1000;
    const lastSubmitted = { id: record.id, createdAt: record.created_at };
    store.setState({ lastSubmitted, cooldownEnd });
    writeStoredState(userId, { lastSubmitted, cooldownEnd });
  };

  const hydrateCooldownState = async (userId) => {
    if (!userId) {
      return;
    }

    const { data, error } = await fetchLatestConfessionByUser(userId);
    const stored = readStoredState(userId);
    if (error) {
      if (isRlsError(error)) {
        if (stored && stored.lastSubmitted) {
          store.setState({
            lastSubmitted: stored.lastSubmitted,
            cooldownEnd: stored.cooldownEnd || null,
          });
        }
        return;
      }
      console.warn("[auth] cooldown lookup failed", error);
      if (stored && stored.lastSubmitted) {
        store.setState({
          lastSubmitted: stored.lastSubmitted,
          cooldownEnd: stored.cooldownEnd || null,
        });
      }
      return;
    }

    if (data) {
      applyCooldownFromRecord(data, userId);
    } else if (stored && stored.lastSubmitted) {
      store.setState({
        lastSubmitted: stored.lastSubmitted,
        cooldownEnd: stored.cooldownEnd || null,
      });
    } else {
      clearStoredState(userId);
    }
  };

  const loadInitialConfessions = async () => {
    if (configError) {
      return;
    }

    store.setState({
      loading: true,
      error: "",
      confessions: [],
      page: { offset: 0, limit: pageSize, hasMore: true },
    });

    const { data, error } = await fetchConfessions({ offset: 0, limit: pageSize });

    if (error) {
      store.setState({ loading: false, error: errorMessage(error) });
      return;
    }

    store.setState({
      loading: false,
      confessions: data,
      page: {
        offset: data.length,
        limit: pageSize,
        hasMore: data.length === pageSize,
      },
    });
  };

  const loadMoreConfessions = async () => {
    const state = store.getState();
    if (configError || state.loadingMore || state.loading || !state.page.hasMore) {
      return;
    }

    store.setState({ loadingMore: true, error: "" });

    const { data, error } = await fetchConfessions({
      offset: state.page.offset,
      limit: state.page.limit,
    });

    if (error) {
      store.setState({ loadingMore: false, error: errorMessage(error) });
      return;
    }

    store.setState((current) => ({
      loadingMore: false,
      confessions: [...current.confessions, ...data],
      page: {
        ...current.page,
        offset: current.page.offset + data.length,
        hasMore: data.length === current.page.limit,
      },
    }));
  };

  const submitConfession = async ({ content, uiMode, name }) => {
    if (configError) {
      store.setState({ submitError: configError });
      return { ok: false, error: configError };
    }

    const trimmedContent = typeof content === "string" ? content.trim() : "";
    const normalizedName = normalizeName(name);
    if (!trimmedContent) {
      const message = "Vent cannot be empty.";
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }
    if (containsSlur(trimmedContent)) {
      const message = "Please remove slurs from your vent.";
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }
    if (normalizedName && containsSlur(normalizedName)) {
      const message = "Name contains blocked language.";
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    const state = store.getState();
    if (!state.isAuthReady || !state.userId) {
      const message = "Connecting... please wait";
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.log("[auth] session error", sessionError);
      const message = "Connecting... please wait";
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    const session = sessionData?.session;
    const sessionUserId = session?.user?.id;
    if (!sessionUserId) {
      const message = "Connecting... please wait";
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    if (state.userId !== sessionUserId) {
      store.setState({ userId: sessionUserId, isAuthReady: true, authLoading: false, authError: "" });
    }

    if (state.cooldownEnd && Date.now() < state.cooldownEnd) {
      const remainingMs = state.cooldownEnd - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      const message = `You can post again in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`;
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    store.setState({ submitting: true, submitError: "" });

    const dbVisibility = "public";
    if (dbVisibility !== "public" && dbVisibility !== "private") {
      const message = "Invalid visibility selection.";
      store.setState({ submitting: false, submitError: message });
      return { ok: false, error: message };
    }

    const payload = {
      content: trimmedContent,
      visibility: dbVisibility,
      user_id: sessionUserId,
    };

    if (uiMode === "public") {
      payload.name = normalizedName;
    } else {
      payload.name = null;
    }

    console.log("INSERT_PAYLOAD", payload);

    const { data, error } = await createConfession(payload);

    if (error) {
      console.log("INSERT_ERROR", error);
      let message = errorMessage(error, "Submission failed. Please try again.");
      if (isRlsError(error)) {
        let cooldownEnd = null;
        let lastSubmitted = null;
        const { data: latest, error: latestError } = await fetchLatestConfessionByUser(sessionUserId);
        if (!latestError && latest) {
          const createdAtMs = parseSupabaseTimestamp(latest.created_at).getTime();
          cooldownEnd = Number.isNaN(createdAtMs) ? null : createdAtMs + 60 * 60 * 1000;
          lastSubmitted = { id: latest.id, createdAt: latest.created_at };
        } else {
          const stored = readStoredState(sessionUserId);
          cooldownEnd = stored?.cooldownEnd || null;
          lastSubmitted = stored?.lastSubmitted || null;
        }

        if (!cooldownEnd && lastSubmitted?.createdAt) {
          const createdAtMs = parseSupabaseTimestamp(lastSubmitted.createdAt).getTime();
          cooldownEnd = Number.isNaN(createdAtMs) ? null : createdAtMs + 60 * 60 * 1000;
        }

        if (cooldownEnd && Date.now() < cooldownEnd) {
          const remainingMs = cooldownEnd - Date.now();
          message = `You're on cooldown. Try again in ${formatCooldown(remainingMs)}.`;
          store.setState({ lastSubmitted, cooldownEnd });
          writeStoredState(sessionUserId, { lastSubmitted, cooldownEnd });
        } else {
          message = "You're on cooldown. Try again later.";
        }
      } else if (error && error.message) {
        message = `${error.message}${error.code ? ` (code ${error.code})` : ""}`;
      }
      store.setState({ submitting: false, submitError: message });
      return { ok: false, error: message };
    }

    const createdAtMs = parseSupabaseTimestamp(data.created_at).getTime();
    const cooldownEnd = Number.isNaN(createdAtMs) ? null : createdAtMs + 60 * 60 * 1000;
    const lastSubmitted = { id: data.id, createdAt: data.created_at };

    if (data.visibility === "public") {
      store.setState((current) => ({
        submitting: false,
        confessions: [data, ...current.confessions],
        lastSubmitted,
        cooldownEnd,
        page: {
          ...current.page,
          offset: current.page.offset + 1,
          hasMore: true,
        },
      }));
    } else {
      store.setState({ submitting: false, lastSubmitted, cooldownEnd });
    }

    writeStoredState(sessionUserId, { lastSubmitted, cooldownEnd });
    return { ok: true, visibility: data.visibility, createdAt: data.created_at };
  };

  const loadReplies = async (confessionId) => {
    if (configError || !confessionId) {
      return;
    }

    writeRepliesState(confessionId, {
      loading: true,
      error: "",
      isOpen: true,
    });

    const { data, error } = await fetchRepliesByConfession(confessionId);

    if (error) {
      writeRepliesState(confessionId, {
        loading: false,
        error: errorMessage(error, "Unable to load replies."),
        isOpen: true,
        hasLoaded: false,
      });
      return;
    }

    writeRepliesState(confessionId, {
      loading: false,
      items: data,
      error: "",
      isOpen: true,
      hasLoaded: true,
    });
  };

  const openReplies = async (confessionId) => {
    if (!confessionId) {
      return;
    }

    const current = store.getState();
    const entry = readRepliesState(current, confessionId);
    writeRepliesState(confessionId, { isOpen: true });

    if (!entry.hasLoaded && !entry.loading) {
      await loadReplies(confessionId);
    }
  };

  const toggleReplies = async (confessionId) => {
    if (!confessionId) {
      return;
    }

    const current = store.getState();
    const entry = readRepliesState(current, confessionId);
    const nextOpen = !entry.isOpen;
    writeRepliesState(confessionId, { isOpen: nextOpen });

    if (nextOpen && !entry.hasLoaded && !entry.loading) {
      await loadReplies(confessionId);
    }
  };

  const submitReply = async ({ confessionId, content, replyName }) => {
    if (configError) {
      writeRepliesState(confessionId, { error: configError, isOpen: true });
      return { ok: false, error: configError };
    }

    const state = store.getState();
    if (!state.isAuthReady || !state.userId) {
      const message = "Connecting... please wait";
      writeRepliesState(confessionId, { error: message, isOpen: true });
      return { ok: false, error: message };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.log("[replies] session error", sessionError);
      const message = "Connecting... please wait";
      writeRepliesState(confessionId, { error: message, isOpen: true });
      return { ok: false, error: message };
    }

    const sessionUserId = sessionData?.session?.user?.id;
    if (!sessionUserId) {
      const message = "Connecting... please wait";
      writeRepliesState(confessionId, { error: message, isOpen: true });
      return { ok: false, error: message };
    }

    if (state.userId !== sessionUserId) {
      store.setState({ userId: sessionUserId, isAuthReady: true, authLoading: false, authError: "" });
    }

    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed) {
      const message = "Reply cannot be empty.";
      writeRepliesState(confessionId, { error: message, isOpen: true });
      return { ok: false, error: message };
    }
    if (containsSlur(trimmed)) {
      const message = "Please remove slurs from your reply.";
      writeRepliesState(confessionId, { error: message, isOpen: true });
      return { ok: false, error: message };
    }
    const { value: replyNameValue, error: replyNameError } = normalizeReplyName(replyName);
    if (replyNameError) {
      writeRepliesState(confessionId, { error: replyNameError, isOpen: true });
      return { ok: false, error: replyNameError };
    }
    writeRepliesState(confessionId, { submitting: true, error: "", isOpen: true });

    const payload = {
      confession_id: confessionId,
      content: trimmed,
      user_id: sessionUserId,
    };
    if (replyNameValue) {
      payload.reply_name = replyNameValue;
    }

    const { data, error } = await createReply(payload);

    if (error) {
      console.error("[replies] insert failed", error);
      let message = errorMessage(error, "Reply failed. Please try again.");
      if (isRlsError(error)) {
        message = "Reply not allowed right now.";
      }
      writeRepliesState(confessionId, { submitting: false, error: message, isOpen: true });
      return { ok: false, error: message };
    }

    writeRepliesState(confessionId, (entry) => ({
      ...entry,
      submitting: false,
      error: "",
      isOpen: true,
      hasLoaded: true,
      items: [...entry.items, data],
    }));

    return { ok: true, data };
  };

  const undoLastSubmission = async () => {
    const state = store.getState();
    if (!state.lastSubmitted) {
      return { ok: false, error: "Nothing to undo." };
    }

    const { error } = await deleteConfession(state.lastSubmitted.id);
    if (error) {
      const message = errorMessage(error, "Undo failed. Please try again.");
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    store.setState((current) => {
      const nextConfessions = current.confessions.filter(
        (item) => item.id !== current.lastSubmitted.id
      );
      const removed = nextConfessions.length !== current.confessions.length;
      return {
        confessions: nextConfessions,
        lastSubmitted: null,
        cooldownEnd: null,
        submitError: "",
        page: {
          ...current.page,
          offset: removed ? Math.max(0, current.page.offset - 1) : current.page.offset,
        },
      };
    });

    if (state.userId) {
      clearStoredState(state.userId);
    }

    return { ok: true };
  };

  return {
    loadInitialConfessions,
    loadMoreConfessions,
    submitConfession,
    undoLastSubmission,
    hydrateCooldownState,
    loadReplies,
    openReplies,
    toggleReplies,
    submitReply,
  };
}
