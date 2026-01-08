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

const rulesButton = document.getElementById("rules-button");
const rulesModal = document.getElementById("rules-modal");
const rulesClose = document.getElementById("rules-close");

const openRules = () => {
  if (!rulesModal) {
    return;
  }
  rulesModal.classList.remove("is-hidden");
  rulesModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const closeRules = () => {
  if (!rulesModal) {
    return;
  }
  rulesModal.classList.add("is-hidden");
  rulesModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
};

if (rulesButton && rulesModal) {
  rulesButton.addEventListener("click", openRules);
  if (rulesClose) {
    rulesClose.addEventListener("click", closeRules);
  }
  rulesModal.addEventListener("click", (event) => {
    if (event.target === rulesModal) {
      closeRules();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !rulesModal.classList.contains("is-hidden")) {
      closeRules();
    }
  });
}

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
