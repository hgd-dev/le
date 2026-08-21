(() => {
  "use strict";
  const video = document.getElementById("roseVideo");
  const pauseButton = document.getElementById("pauseButton");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (reducedMotion.matches) {
    video.pause();
    pauseButton.textContent = "▶";
    pauseButton.setAttribute("aria-pressed", "true");
    pauseButton.setAttribute("aria-label", "Play rose animation");
  } else {
    video.play().catch(() => {});
  }

  pauseButton.addEventListener("click", () => {
    if (video.paused) {
      video.play().catch(() => {});
      pauseButton.textContent = "Ⅱ";
      pauseButton.setAttribute("aria-pressed", "false");
      pauseButton.setAttribute("aria-label", "Pause rose animation");
    } else {
      video.pause();
      pauseButton.textContent = "▶";
      pauseButton.setAttribute("aria-pressed", "true");
      pauseButton.setAttribute("aria-label", "Play rose animation");
    }
  });
})();
