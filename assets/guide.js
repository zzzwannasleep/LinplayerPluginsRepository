import { delay } from "./data.js";

// 指南页无数据请求，仅播放 加载 → 进入 动画。
(async () => {
  await delay(350);
  const pre = document.getElementById("preloader");
  const app = document.getElementById("app");
  if (pre) {
    pre.classList.add("animate__animated", "animate__fadeOut");
    pre.addEventListener("animationend", () => (pre.style.display = "none"), { once: true });
  }
  if (app) {
    app.classList.remove("is-hidden");
    app.classList.add("animate__animated", "animate__fadeInUp");
  }
})();
