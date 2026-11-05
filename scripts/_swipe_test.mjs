import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9334;
const BASE = process.env.SHOT_BASE || "http://127.0.0.1:8768/";
const OUT = "shots/swipe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), "swipe-" + Date.now());
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu", "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

async function target() {
  for (let i = 0; i < 80; i++) {
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
  return r.result?.result?.value;
};

const SEED = `(() => { const w = {}; for (let i = 1; i <= 60; i++) w[i] = { status: "learning", favorite: false, reviewAt: Date.now() + 86400000, correctStreak: 0 }; localStorage.setItem("wordsInBloomData", JSON.stringify({ v: 2, words: w, dates: [], lastWordId: 5, studyCollectionId: "all", motion: false, quizCursor: false, pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null } })); return 1; })()`;

await send("Page.navigate", { url: BASE });
await sleep(2500);
await ev(SEED);
await send("Page.reload", { ignoreCache: true });
await sleep(3000);

const touch = (type, points) => send("Input.dispatchTouchEvent", { type, touchPoints: points });

const swipe = async (fromX, toX, y, steps = 8) => {
  await touch("touchStart", [{ x: fromX, y, id: 1 }]);
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    await touch("touchMove", [{ x, y, id: 1 }]);
    await sleep(18);
  }
  await touch("touchEnd", []);
};

const currentWord = () => ev(`(document.querySelector(".study-word")||{}).textContent || ""`);
const flashWord = () => ev(`(document.querySelector(".flip-word")||{}).textContent || ""`);

const go = async (page) => {
  await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="${page}"]'); if (b) b.click(); return 1; })()`);
  await sleep(1200);
};

// ---------- 沉浸学习：左滑下一个 / 右滑上一个 ----------
await go("study");
const before = await currentWord();
await swipe(320, 90, 430);
await sleep(900);
const afterLeft = await currentWord();
console.log("study swipe-left:", JSON.stringify(before), "->", JSON.stringify(afterLeft), before !== afterLeft ? "OK" : "FAIL");

await swipe(90, 320, 430);
await sleep(900);
const afterRight = await currentWord();
console.log("study swipe-right:", JSON.stringify(afterLeft), "->", JSON.stringify(afterRight), afterRight === afterLeft ? "FAIL" : "OK");

// 小幅滑动不应切换
await swipe(300, 260, 430, 4);
await sleep(700);
console.log("study small swipe:", (await currentWord()) === afterRight ? "OK (未切换)" : "FAIL");

// ---------- 记忆卡片 ----------
await go("flash");
const fBefore = await flashWord();
await swipe(320, 90, 400);
await sleep(900);
const fAfter = await flashWord();
console.log("flash swipe-left:", JSON.stringify(fBefore), "->", JSON.stringify(fAfter), fBefore !== fAfter ? "OK" : "FAIL");

// ---------- 拖拽中的视觉反馈截图 ----------
await go("study");
await touch("touchStart", [{ x: 300, y: 430, id: 1 }]);
for (let i = 1; i <= 6; i++) {
  await touch("touchMove", [{ x: 300 - i * 18, y: 432, id: 1 }]);
  await sleep(24);
}
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(join(OUT, "dragging.png"), Buffer.from(shot.result.data, "base64"));
console.log("drag state:", await ev(`(() => { const s = document.querySelector(".study-stage"); return JSON.stringify({ cls: s.className, x: s.style.getPropertyValue("--swipe-x"), o: s.style.getPropertyValue("--swipe-o"), t: getComputedStyle(s).transform }); })()`));
await touch("touchEnd", []);
await sleep(800);
console.log("after release:", await ev(`(() => { const s = document.querySelector(".study-stage"); return JSON.stringify({ cls: s.className, x: s.style.getPropertyValue("--swipe-x") }); })()`));

// ---------- 滑动不应误触卡片内的按钮 ----------
await go("study");
await ev(`(() => {
  window.__clicks = 0;
  const b = document.querySelector(".study-actions .pill");
  b.addEventListener("click", () => { window.__clicks += 1; });
  return 1;
})()`);
const btn = await ev(`(() => { const r = document.querySelector(".study-actions .pill").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await swipe(btn.x + 70, btn.x - 70, btn.y, 8);
await sleep(800);
console.log("swipe over button -> clicks:", await ev(`window.__clicks`), (await ev(`window.__clicks`)) === 0 ? "OK (未误触)" : "FAIL");

// ---------- 普通点击仍然生效 ----------
await go("study");
await ev(`(() => {
  window.__clicks = 0;
  const b = document.querySelector(".study-actions .pill");
  b.addEventListener("click", () => { window.__clicks += 1; });
  return 1;
})()`);
const btn2 = await ev(`(() => { const r = document.querySelector(".study-actions .pill").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await touch("touchStart", [{ x: btn2.x, y: btn2.y, id: 1 }]);
await sleep(40);
await touch("touchEnd", []);
await sleep(500);
console.log("tap on button -> clicks:", await ev(`window.__clicks`), (await ev(`window.__clicks`)) === 1 ? "OK" : "FAIL");

// ---------- 记忆卡片：点击翻面仍然有效 ----------
await go("flash");
const flippedBefore = await ev(`!!document.querySelector(".flip-card.flipped")`);
await touch("touchStart", [{ x: 195, y: 400, id: 1 }]);
await sleep(40);
await touch("touchEnd", []);
await sleep(600);
const flippedAfter = await ev(`!!document.querySelector(".flip-card.flipped")`);
console.log("flash tap flip:", flippedBefore, "->", flippedAfter, flippedBefore !== flippedAfter ? "OK" : "FAIL");

chrome.kill();
process.exit(0);
