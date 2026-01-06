import { createConfession, fetchConfessions, getConfigError, getPageSize } from "../data/confessionsApi.js";

const DEFAULT_ERROR = "We could not reach the confession stream.";

function errorMessage(error, fallback = DEFAULT_ERROR) {
  if (!error) {
    return "";
  }
  return error.message || fallback;
}

export function createActions(store) {
  const pageSize = getPageSize();
  const configError = getConfigError();

  if (configError) {
    store.setState({ configError });
  }

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

  const submitConfession = async ({ content, visibility }) => {
    if (configError) {
      store.setState({ submitError: configError });
      return { ok: false, error: configError };
    }

    store.setState({ submitting: true, submitError: "" });

    const { data, error } = await createConfession({ content, visibility });

    if (error) {
      const message = errorMessage(error, "Submission failed. Please try again.");
      store.setState({ submitting: false, submitError: message });
      return { ok: false, error: message };
    }

    if (data.visibility === "public") {
      store.setState((current) => ({
        submitting: false,
        confessions: [data, ...current.confessions],
        page: {
          ...current.page,
          offset: current.page.offset + 1,
          hasMore: true,
        },
      }));
    } else {
      store.setState({ submitting: false });
    }

    return { ok: true, visibility: data.visibility };
  };

  return {
    loadInitialConfessions,
    loadMoreConfessions,
    submitConfession,
  };
}
