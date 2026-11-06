import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9338;
const BASE = "http://127.0.0.1:8773/";
const OUT = "shots/flash";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), "flash-" + Date.now());
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu", "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

async function target() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === "page");
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error("no devtools");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pend = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () => resolve((method, params = {}) => new Promise((res) => {
      const i = ++id; pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    })));
  });
}

const send = await connect((await target()).webSocketDebuggerUrl);
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + r.result.exceptionDetails.text;
  return r.result?.result?.value;
};

const touch = (type, points) => send("Input.dispatchTouchEvent", { type, touchPoints: points });
const swipe = async (fromX, toX, y, steps = 8) => {
  await touch("touchStart", [{ x: fromX, y, id: 1 }]);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", [{ x: fromX + ((toX - fromX) * i) / steps, y, id: 1 }]);
    await sleep(16);
  }
  await touch("touchEnd", []);
};

const STATE = `(() => {
  const scene = document.querySelector(".flip-scene");
  const card = document.querySelector(".flip-card");
  if (!scene || !card) return "MISSING";
  const cs = getComputedStyle(scene);
  const r = card.getBoundingClientRect();
  const word = (document.querySelector(".flip-word") || {}).textContent || "";
  return JSON.stringify({
    sceneOpacity: Number(cs.opacity).toFixed(2),
    sceneTransform: cs.transform === "none" ? "none" : "matrix",
    cardH: Math.round(r.height),
    word: word,
    anims: scene.getAnimations().length
  });
})()`;

const shot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(res.result.data, "base64"));
};

await send("Page.navigate", { url: BASE });
await sleep(2800);
await ev(`localStorage.setItem("wordsInBloomTheme","light")`);
await send("Page.reload", { ignoreCache: true });
await sleep(3000);

// 逐帧采样卡片位置，用于量化"抖动"
const SAMPLER = (sel) => `(() => {
  window.__samples = [];
  window.__sampling = true;
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return "no el";
  const tick = (t) => {
    const r = el.getBoundingClientRect();
    window.__samples.push([Math.round(t), Math.round(r.left), Math.round(r.width)]);
    if (window.__sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "sampling";
})()`;

const ANALYZE = `(() => {
  window.__sampling = false;
  const s = window.__samples || [];
  let maxJump = 0, maxOpacityJump = 0;
  for (let i = 1; i < s.length; i++) {
    maxJump = Math.max(maxJump, Math.abs(s[i][1] - s[i - 1][1]));
  }
  return JSON.stringify({ frames: s.length, maxFrameJumpPx: maxJump, first: s[0] && s[0].slice(1), last: s[s.length - 1] && s[s.length - 1].slice(1) });
})()`;

const measure = async (page, sel) => {
  await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="${page}"]'); if (b) b.click(); return 1; })()`);
  await sleep(1400);
  await ev(SAMPLER(sel));
  await swipe(320, 80, 430);
  await sleep(700);
  return await ev(ANALYZE);
};

console.log("study  frame profile:", await measure("study", ".study-card"));
console.log("flash  frame profile:", await measure("flash", ".flip-card"));
console.log("study  frame profile #2:", await measure("study", ".study-card"));
console.log("flash  frame profile #2:", await measure("flash", ".flip-card"));

await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="flash"]'); if (b) b.click(); return 1; })()`);
await sleep(1400);
console.log("initial:", await ev(STATE));

for (let i = 1; i <= 5; i++) {
  await swipe(320, 80, 430);
  await sleep(700);
  console.log(`swipe #${i}:`, await ev(STATE));
}
await shot("after-5-swipes");

// 连续快速滑动（模拟手快，间隔极短以命中切换动画窗口）
for (let i = 0; i < 6; i++) {
  await swipe(320, 80, 430, 3);
  await sleep(15);
}
await sleep(1000);
console.log("rapid x6:", await ev(STATE), "page=", await ev(`document.body.dataset.page`));
await shot("after-rapid");

// 学习页同样做一次快速连滑，页面不应被切走
await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="study"]'); if (b) b.click(); return 1; })()`);
await sleep(1200);
console.log("after nav click: page=", await ev(`document.body.dataset.page`));
console.log("stage rect:", await ev(`(() => { const s = document.querySelector(".page.active .swipe-deck"); if (!s) return "none"; const r = s.getBoundingClientRect(); return JSON.stringify({cls: s.className, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right)}); })()`));
await ev(`window.__sw = []`);
for (let i = 0; i < 4; i++) {
  await swipe(320, 80, 430, 3);
  await sleep(15);
  console.log(`  study swipe #${i + 1} -> page=`, await ev(`document.body.dataset.page`));
}
console.log("touch log:", await ev(`JSON.stringify(window.__sw)`));
await sleep(800);
console.log("study rapid:", "page=", await ev(`document.body.dataset.page`),
  "word=", await ev(`(document.querySelector(".study-word")||{}).textContent || ""`));
await shot("after-study-rapid");

await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="flash"]'); if (b) b.click(); return 1; })()`);
await sleep(1200);

// 按钮切换
await ev(`(() => { const b = Array.from(document.querySelectorAll(".flash-nav .round-btn")).pop(); if (b) b.click(); return 1; })()`);
await sleep(700);
console.log("arrow next:", await ev(STATE));

// 点击翻面仍然可用
await ev(`(() => { const c = document.querySelector(".flip-card"); if (c) c.click(); return 1; })()`);
await sleep(600);
console.log("flip:", await ev(`!!document.querySelector(".flip-card.flipped")`), await ev(STATE));

chrome.kill();
process.exit(0);
