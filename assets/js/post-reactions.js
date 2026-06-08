(function () {
  const widget = document.querySelector(".post-reactions[data-page-key]");
  if (!widget) return;

  const button = widget.querySelector("[data-like-button]");
  const countNode = widget.querySelector("[data-like-count]");
  const labelNode = widget.querySelector("[data-like-label]");
  if (!button || !countNode || !labelNode) return;

  const namespace = "fengqiliang93-github-io";
  const rawKey = widget.dataset.pageKey || location.pathname;
  const key = rawKey.replace(/^\/|\/$/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "home";
  const likedStorageKey = `post-liked:${key}`;
  const localCountKey = `post-like-count:${key}`;
  const endpoint = `https://api.counterapi.dev/v1/${namespace}/${key}-likes`;

  function setCount(value) {
    const number = Number(value);
    countNode.textContent = Number.isFinite(number) ? String(number) : "0";
  }

  function setLiked() {
    button.classList.add("is-liked");
    button.setAttribute("aria-pressed", "true");
    button.disabled = true;
    labelNode.textContent = "已点赞";
    const icon = button.querySelector(".post-reaction-icon");
    if (icon) icon.textContent = "♥";
  }

  async function readRemoteCount() {
    const response = await fetch(`${endpoint}/`, { cache: "no-store" });
    if (!response.ok) throw new Error(`CounterAPI read failed: ${response.status}`);
    const data = await response.json();
    return data.count;
  }

  async function incrementRemoteCount() {
    const response = await fetch(`${endpoint}/up`, { cache: "no-store" });
    if (!response.ok) throw new Error(`CounterAPI increment failed: ${response.status}`);
    const data = await response.json();
    return data.count;
  }

  function readLocalCount() {
    return Number(localStorage.getItem(localCountKey) || "0");
  }

  function incrementLocalCount() {
    const next = readLocalCount() + 1;
    localStorage.setItem(localCountKey, String(next));
    return next;
  }

  if (localStorage.getItem(likedStorageKey) === "1") {
    setLiked();
  }

  readRemoteCount()
    .then(setCount)
    .catch(() => setCount(readLocalCount()));

  button.addEventListener("click", async () => {
    if (localStorage.getItem(likedStorageKey) === "1") return;

    button.disabled = true;
    try {
      const count = await incrementRemoteCount();
      setCount(count);
    } catch (_) {
      setCount(incrementLocalCount());
    }

    localStorage.setItem(likedStorageKey, "1");
    setLiked();
  });
})();
