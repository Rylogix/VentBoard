export function createSubmitUI({ store, actions }) {
  const form = document.getElementById("confession-form");
  const textarea = document.getElementById("confession-input");
  const nameField = document.getElementById("name-field");
  const nameInput = document.getElementById("confession-name");
  const feedback = document.getElementById("form-feedback");
  const submitButton = form.querySelector("button[type='submit']");
  const undoButton = document.getElementById("undo-submit");
  const cooldownTimer = document.getElementById("cooldown-timer");
  const maxNameLength = 32;

  const showFeedback = (message, tone = "") => {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
  };

  const updateButton = () => {
    const state = store.getState();
    const now = Date.now();
    const cooldownActive = state.cooldownEnd && now < state.cooldownEnd;
    submitButton.disabled =
      !form.checkValidity() ||
      state.submitting ||
      !!state.configError ||
      !!state.authError ||
      state.authLoading ||
      !state.isAuthReady ||
      !state.userId ||
      cooldownActive;
  };

  const normalizeName = (value) => value.replace(/\s+/g, " ").trim();

  const formatCooldown = (remainingMs) => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes >= 60) {
      return `${Math.ceil(minutes)}m`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const updateCooldownUI = () => {
    const state = store.getState();
    if (state.authLoading) {
      cooldownTimer.textContent = "Connecting...";
      return;
    }
    if (state.authError) {
      cooldownTimer.textContent = "Unable to connect. Refresh and try again.";
      return;
    }
    if (!state.cooldownEnd) {
      cooldownTimer.textContent = "";
      return;
    }
    const remainingMs = state.cooldownEnd - Date.now();
    if (remainingMs <= 0) {
      cooldownTimer.textContent = "";
      return;
    }
    cooldownTimer.textContent = `Next confession in ${formatCooldown(remainingMs)}.`;
  };

  const updateUndoUI = () => {
    const state = store.getState();
    if (!state.lastSubmitted) {
      undoButton.classList.add("is-hidden");
      return;
    }
    const createdAt = new Date(state.lastSubmitted.createdAt).getTime();
    const canUndo = !Number.isNaN(createdAt) && Date.now() - createdAt <= 5 * 60 * 1000;
    undoButton.classList.toggle("is-hidden", !canUndo);
  };

  const updateVisibility = () => {
    const visibilityInput = form.querySelector("input[name='visibility']:checked");
    const isPublic = visibilityInput && visibilityInput.value === "public";
    nameField.classList.toggle("is-hidden", !isPublic);
    nameInput.required = !!isPublic;
    nameInput.disabled = !isPublic;
    if (!isPublic) {
      nameInput.value = "";
    }
    updateButton();
  };

  form.addEventListener("input", updateButton);
  form.addEventListener("change", updateVisibility);
  undoButton.addEventListener("click", async () => {
    const result = await actions.undoLastSubmission();
    if (!result.ok) {
      showFeedback(result.error || "Undo failed.");
      return;
    }
    showFeedback("Confession removed.", "success");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const content = textarea.value.trim();
    const visibilityInput = form.querySelector("input[name='visibility']:checked");
    if (!content || !visibilityInput) {
      showFeedback("Please add text and choose a visibility.");
      return;
    }

    const uiMode = visibilityInput.value;
    if (uiMode !== "public" && uiMode !== "anonymous") {
      console.error("[submit] invalid visibility selection", { uiMode });
      showFeedback("Invalid visibility selection.");
      return;
    }
    let name = null;
    if (uiMode === "public") {
      const normalizedName = normalizeName(nameInput.value);
      if (!normalizedName) {
        showFeedback("Add a name to submit publicly.");
        nameInput.focus();
        return;
      }
      if (normalizedName.length > maxNameLength) {
        showFeedback(`Name must be ${maxNameLength} characters or fewer.`);
        nameInput.focus();
        return;
      }
      name = normalizedName;
    } else {
      nameInput.value = "";
    }

    const result = await actions.submitConfession({
      content,
      uiMode,
      name,
    });

    if (!result.ok) {
      showFeedback(result.error || "Submission failed.");
      return;
    }

    form.reset();
    updateVisibility();
    textarea.focus();
    const successMessage =
      result.visibility === "private"
        ? "Saved anonymously. It will not appear in the public feed."
        : "Confession released.";
    showFeedback(successMessage, "success");
  });

  store.subscribe((state) => {
    if (state.configError) {
      showFeedback(state.configError);
    } else if (state.authError) {
      showFeedback(state.authError);
    } else if (state.submitError) {
      showFeedback(state.submitError);
    }

    updateButton();
    updateCooldownUI();
    updateUndoUI();
  });

  updateVisibility();
  updateCooldownUI();
  updateUndoUI();
  setInterval(updateCooldownUI, 1000);
}
