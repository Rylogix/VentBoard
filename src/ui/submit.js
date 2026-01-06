export function createSubmitUI({ store, actions }) {
  const form = document.getElementById("confession-form");
  const textarea = document.getElementById("confession-input");
  const nameField = document.getElementById("name-field");
  const nameInput = document.getElementById("confession-name");
  const feedback = document.getElementById("form-feedback");
  const submitButton = form.querySelector("button[type='submit']");
  const maxNameLength = 32;

  const showFeedback = (message, tone = "") => {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
  };

  const updateButton = () => {
    const state = store.getState();
    submitButton.disabled = !form.checkValidity() || state.submitting || !!state.configError;
  };

  const normalizeName = (value) => value.replace(/\s+/g, " ").trim();

  const updateVisibility = () => {
    const visibilityInput = form.querySelector("input[name='visibility']:checked");
    const isPublic = visibilityInput && visibilityInput.value === "public";
    nameField.classList.toggle("is-hidden", !isPublic);
    nameInput.required = !!isPublic;
    nameInput.disabled = !isPublic;
    updateButton();
  };

  form.addEventListener("input", updateButton);
  form.addEventListener("change", updateVisibility);

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

    const visibility = visibilityInput.value;
    let name = null;
    if (visibility === "public") {
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
    }

    const result = await actions.submitConfession({
      content,
      visibility,
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
    } else if (state.submitError) {
      showFeedback(state.submitError);
    }

    updateButton();
  });

  updateVisibility();
}
