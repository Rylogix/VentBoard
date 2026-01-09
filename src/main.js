import { createActions } from "./state/actions.js";
import { getPageSize } from "./data/confessionsApi.js";
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
  page: { offset: 0, limit: getPageSize(), hasMore: true },
});

const actions = createActions(store);

createFeedUI({ store, actions });
createSubmitUI({ store, actions });

const rulesButton = document.getElementById("rules-button");
const rulesModal = document.getElementById("rules-modal");
const rulesClose = document.getElementById("rules-close");
const supportButton = document.getElementById("support-button");
const supportModal = document.getElementById("support-modal");
const supportClose = document.getElementById("support-close");

const setModalState = (modal, isOpen) => {
  if (!modal) {
    return;
  }
  modal.classList.toggle("is-hidden", !isOpen);
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
};

const closeAllModals = () => {
  setModalState(rulesModal, false);
  setModalState(supportModal, false);
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
};

const applyModalLock = () => {
  const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  document.body.style.paddingRight = scrollBarWidth > 0 ? `${scrollBarWidth}px` : "";
};

const openModal = (modal) => {
  if (!modal) {
    return;
  }
  closeAllModals();
  setModalState(modal, true);
  applyModalLock();
};

if (rulesButton && rulesModal) {
  rulesButton.addEventListener("click", () => openModal(rulesModal));
}
if (rulesClose) {
  rulesClose.addEventListener("click", closeAllModals);
}
if (supportButton && supportModal) {
  supportButton.addEventListener("click", () => openModal(supportModal));
}
if (supportClose) {
  supportClose.addEventListener("click", closeAllModals);
}
[rulesModal, supportModal].forEach((modal) => {
  if (!modal) {
    return;
  }
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeAllModals();
    }
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const rulesOpen = rulesModal && !rulesModal.classList.contains("is-hidden");
    const supportOpen = supportModal && !supportModal.classList.contains("is-hidden");
    if (rulesOpen || supportOpen) {
      closeAllModals();
    }
  }
});

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
