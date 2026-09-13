(() => {
  const storageKey = "flowz:theme";
  const systemTheme = window.matchMedia("(prefers-color-scheme: light)");

  function savedTheme() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function preferredTheme() {
    return savedTheme() || (systemTheme.matches ? "light" : "dark");
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === "light" ? "#f4f5f1" : "#080908";

    const toggle = document.querySelector("#theme-toggle");
    if (toggle) {
      const nextTheme = theme === "light" ? "dark" : "light";
      const label = `Switch to ${nextTheme} mode`;
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
      toggle.setAttribute("aria-pressed", String(theme === "light"));
    }
  }

  applyTheme(preferredTheme());

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(preferredTheme());
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch {
        // The selected theme still applies for this page when storage is unavailable.
      }
      applyTheme(nextTheme);
    });
  });

  systemTheme.addEventListener("change", () => {
    if (!savedTheme()) applyTheme(preferredTheme());
  });
})();
