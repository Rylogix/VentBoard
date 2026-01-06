import { createActions } from "./state/actions.js";
import { createStore } from "./state/store.js";
import { createFeedUI } from "./ui/feed.js";
import { createSubmitUI } from "./ui/submit.js";

const store = createStore({
  confessions: [],
  loading: false,
  loadingMore: false,
  submitting: false,
  error: "",
  submitError: "",
  configError: "",
  authError: "",
  userId: "",
  lastSubmitted: null,
  cooldownEnd: null,
  page: { offset: 0, limit: 12, hasMore: true },
});

const actions = createActions(store);

createFeedUI({ store, actions });
createSubmitUI({ store, actions });

const connectionStatus = document.getElementById("connection-status");

store.subscribe((state) => {
  if (state.configError) {
    connectionStatus.textContent = "Config missing";
    connectionStatus.dataset.state = "error";
    return;
  }

  if (state.error) {
    connectionStatus.textContent = "Feed issue";
    connectionStatus.dataset.state = "warning";
    return;
  }

  connectionStatus.textContent = "Connected";
  connectionStatus.dataset.state = "ok";
});

actions.bootstrapAuth();
actions.loadInitialConfessions();
