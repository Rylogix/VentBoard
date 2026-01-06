export function createSubmitUI({ store, actions }) {
  const form = document.getElementById("confession-form");
  const textarea = document.getElementById("confession-input");
  const feedback = document.getElementById("form-feedback");
  const submitButton = form.querySelector("button[type='submit']");

  const showFeedback = (message, tone = "") => {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
  };

  const updateButton = () => {
    const state = store.getState();
    submitButton.disabled = !form.checkValidity() || state.submitting || !!state.configError;
  };

  form.addEventListener("input", updateButton);

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

    const result = await actions.submitConfession({
      content,
      visibility: visibilityInput.value,
    });

    if (!result.ok) {
      showFeedback(result.error || "Submission failed.");
      return;
    }

    form.reset();
    textarea.focus();
    const successMessage =
      result.visibility === "private"
        ? "Saved privately. It will not appear in the public feed."
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

  updateButton();
}
