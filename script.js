const milestones = [
  "点击 HTML 结构：理解页面骨架。",
  "切换到 CSS：把内容做得更清晰更美观。",
  "学习 JS：通过按钮改变页面状态。",
  "完成一次小项目：加新卡片、改颜色或提示文本。"
];

let current = 0;
const total = milestones.length;

const btn = document.getElementById("next-step-btn");
const status = document.getElementById("status");
const tip = document.getElementById("tip");
const bar = document.getElementById("progress-bar");

function refresh() {
  const progress = (current / total) * 100;
  status.textContent = `已完成进度：${current} / ${total}`;
  bar.style.width = `${progress}%`;
  tip.textContent = current === 0
    ? "点击按钮来推进学习进度。"
    : milestones[Math.min(current - 1, total - 1)];
}

btn.addEventListener("click", () => {
  if (current < total) {
    current += 1;
  } else {
    current = 0;
  }
  refresh();
});

refresh();
