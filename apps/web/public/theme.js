// Applies the saved theme before first paint so the window never flashes.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("socius.theme");
  } catch (e) {}
  if (theme !== "light" && theme !== "dark")
    theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
})();
