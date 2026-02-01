(() => {
  const editKey = window.__EDIT_KEY__ || "";
  const inputs = Array.from(document.querySelectorAll("input[data-category-id]"));
  const rows = Array.from(document.querySelectorAll(".score-row"));
  const segments = Array.from(document.querySelectorAll(".segment"));

  function getRow(categoryId) {
    return document.querySelector(`.score-row[data-category-id="${categoryId}"]`);
  }

  function showSaved(input) {
    const wrapper = input.closest(".player-col");
    if (!wrapper) return;
    const indicator = wrapper.querySelector(".saved-indicator");
    if (!indicator) return;
    indicator.classList.add("show");
    window.setTimeout(() => indicator.classList.remove("show"), 800);
  }

  function updateLeaderForRow(row) {
    const jaredInput = row.querySelector('input[data-player="jared"]');
    const steveInput = row.querySelector('input[data-player="steve"]');
    const jaredVal = Number(jaredInput.value || 0);
    const steveVal = Number(steveInput.value || 0);
    const jaredWrap = row.querySelector('.player-col[data-player="jared"]');
    const steveWrap = row.querySelector('.player-col[data-player="steve"]');

    jaredWrap.classList.remove("leading");
    steveWrap.classList.remove("leading");

    if (jaredVal > steveVal) jaredWrap.classList.add("leading");
    if (steveVal > jaredVal) steveWrap.classList.add("leading");
  }

  function updateAllLeaders() {
    rows.forEach(updateLeaderForRow);
  }

  async function saveScore(input) {
    const categoryId = input.dataset.categoryId;
    const player = input.dataset.player;
    const score = Number(input.value);

    if (!Number.isInteger(score) || score < 0) {
      return;
    }

    if (input.dataset.lastValue === input.value) {
      return;
    }

    const payload = { player, categoryId, score };
    const headers = { "Content-Type": "application/json" };
    if (editKey) headers["x-edit-key"] = editKey;

    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return;
      }

      input.dataset.lastValue = input.value;
      showSaved(input);
      const row = getRow(categoryId);
      if (row) updateLeaderForRow(row);
    } catch (err) {
      console.error("Failed to save score", err);
    }
  }

  function handleBlur(event) {
    saveScore(event.target);
  }

  function handleKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }
  }

  inputs.forEach((input) => {
    input.dataset.lastValue = input.value;
    input.addEventListener("blur", handleBlur);
    input.addEventListener("keydown", handleKeydown);
  });

  function applyFilter(filter) {
    rows.forEach((row) => {
      const group = row.dataset.group;
      if (filter === "all" || group === filter) {
        row.classList.remove("hidden");
      } else {
        row.classList.add("hidden");
      }
    });
  }

  segments.forEach((segment) => {
    segment.addEventListener("click", () => {
      segments.forEach((s) => s.classList.remove("active"));
      segment.classList.add("active");
      applyFilter(segment.dataset.filter);
    });
  });

  updateAllLeaders();
})();
