import { createActions } from "./state/actions.js";
import { startAuthBootstrap } from "./state/authBootstrap.js";
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
  authLoading: true,
  isAuthReady: false,
  userId: "",
  repliesByConfession: {},
  lastSubmitted: null,
  cooldownEnd: null,
  page: { offset: 0, limit: 12, hasMore: true },
});

const actions = createActions(store);

createFeedUI({ store, actions });
createSubmitUI({ store, actions });

const connectionStatus = document.getElementById("connection-status");

if (connectionStatus) {
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
}

startAuthBootstrap({ store, actions });
actions.loadInitialConfessions();
