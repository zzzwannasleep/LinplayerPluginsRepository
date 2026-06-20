import { delay } from "./data.js";

// warm = 本会话已展示过加载动画，后续只淡入。
const WARM = document.documentElement.hasAttribute("data-warm");

// 指南页无数据请求：首次播放 加载→进入 动画；warm 时只快速淡入。
(async () => {
  await delay(WARM ? 0 : 350);
  const pre = document.getElementById("preloader");
  const app = document.getElementById("app");
  if (pre && !WARM) {
    pre.classList.add("animate__animated", "animate__fadeOut");
    pre.addEventListener("animationend", () => (pre.style.display = "none"), { once: true });
  }
  if (app) {
    app.classList.remove("is-hidden");
    app.classList.add("animate__animated", WARM ? "animate__fadeIn" : "animate__fadeInUp");
    if (WARM) app.style.setProperty("--animate-duration", "0.4s");
  }
})();
