import {
  createConfession,
  deleteConfession,
  fetchConfessions,
  fetchLatestConfessionByUser,
  getConfigError,
  getPageSize,
} from "../data/confessionsApi.js";

const DEFAULT_ERROR = "We could not reach the confession stream.";
const AUTH_ERROR = "Unable to connect. Refresh and try again.";

function errorMessage(error, fallback = DEFAULT_ERROR) {
  if (!error) {
    return "";
  }
  return error.message || fallback;
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

  const applyCooldownFromRecord = (record, userId) => {
    if (!record || !record.created_at) {
      return;
    }
    const createdAtMs = new Date(record.created_at).getTime();
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

  const submitConfession = async ({ content, visibility, name }) => {
    if (configError) {
      store.setState({ submitError: configError });
      return { ok: false, error: configError };
    }

    const state = store.getState();
    if (!state.userId) {
      const message = state.authError || AUTH_ERROR;
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    if (state.cooldownEnd && Date.now() < state.cooldownEnd) {
      const remainingMs = state.cooldownEnd - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      const message = `You can post again in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`;
      store.setState({ submitError: message });
      return { ok: false, error: message };
    }

    store.setState({ submitting: true, submitError: "" });

    const { data, error } = await createConfession({
      content,
      visibility,
      name,
      userId: state.userId,
    });

    if (error) {
      console.error("[supabase] insert error", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      let message = errorMessage(error, "Submission failed. Please try again.");
      if (isRlsError(error)) {
        const remainingMs = state.cooldownEnd ? state.cooldownEnd - Date.now() : 0;
        if (remainingMs > 0) {
          const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
          message = `You can post again in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`;
        } else {
          message = "Please try again later.";
        }
      }
      store.setState({ submitting: false, submitError: message });
      return { ok: false, error: message };
    }

    const createdAtMs = new Date(data.created_at).getTime();
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

    writeStoredState(state.userId, { lastSubmitted, cooldownEnd });
    return { ok: true, visibility: data.visibility, createdAt: data.created_at };
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
  };
}
