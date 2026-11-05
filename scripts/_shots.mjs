import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = process.env.SHOT_BASE || "http://127.0.0.1:8767/";
const OUT = process.env.SHOT_OUT || "shots";
const W = Number(process.env.SHOT_W || 390);
const H = Number(process.env.SHOT_H || 844);
const PAGES = ["home", "library", "study", "flash", "quiz", "favorites"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), "shot-" + Date.now());
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
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

const SEED = `(() => { const w = {}; for (let i = 1; i <= 40; i++) w[i] = { status: "learning", favorite: i % 7 === 0, reviewAt: Date.now() + 86400000, correctStreak: 0 }; localStorage.setItem("wordsInBloomData", JSON.stringify({ v: 2, words: w, dates: [], lastWordId: 5, studyCollectionId: "all", motion: false, quizCursor: false, pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null } })); return 1; })()`;

await send("Page.navigate", { url: BASE });
await sleep(2500);
await ev(SEED);
await send("Page.reload", { ignoreCache: true });
await sleep(3200);

const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 1.5 || r.left < -1.5) {
      bad.push((el.className || el.tagName) + " L" + Math.round(r.left) + " R" + Math.round(r.right));
    }
  });
  return { vw: vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12) };
})()`;

for (const p of PAGES) {
  await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="${p}"]') || document.querySelector('#topNav [data-page="${p}"]'); if (b) b.click(); return 1; })()`);
  await sleep(1400);
  const info = await ev(OVERFLOW);
  console.log("==", p, "==", JSON.stringify(info));
  const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, p + ".png"), Buffer.from(res.result.data, "base64"));
  console.log("shot", p);
}

// --- 极端用例：最长单词 + 测验答题态 ---
await ev(`(() => {
  const d = JSON.parse(localStorage.getItem("wordsInBloomData"));
  d.lastWordId = 69;
  localStorage.setItem("wordsInBloomData", JSON.stringify(d));
  return 1;
})()`);
await send("Page.reload", { ignoreCache: true });
await sleep(3000);
await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="study"]'); if (b) b.click(); return 1; })()`);
await sleep(1400);
console.log("== study-long ==", JSON.stringify(await ev(OVERFLOW)));
let res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(join(OUT, "study-long.png"), Buffer.from(res.result.data, "base64"));

await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="quiz"]'); if (b) b.click(); return 1; })()`);
await sleep(1200);
const clickAt = async (sel) => {
  const rect = await ev(`(() => {
    const b = ${sel};
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!rect) return false;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  return true;
};

await ev(`(() => { window.__err = null; window.addEventListener("error", (e) => { window.__err = (e.message || "") + " @ " + (e.filename || "") + ":" + (e.lineno || 0); }); return 1; })()`);
console.log("clicked start:", await clickAt(`Array.from(document.querySelectorAll("button")).find(x => x.textContent.includes("开始测试"))`));
await sleep(1200);
console.log("page error:", await ev(`window.__err`));
console.log("has options:", await ev(`!!document.querySelector(".options")`));
console.log("blank-row layout:", await ev(`(() => {
  const row = document.querySelector(".blank-row");
  if (!row) return "no row";
  const f = row.querySelector(".field");
  const b = row.querySelector(".pill");
  const g = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.left) + ".." + Math.round(r.right) + " w" + Math.round(r.width) + " top" + Math.round(r.top); };
  return JSON.stringify({ row: g(row), field: g(f), btn: g(b), rowWrap: getComputedStyle(row).flexWrap, fieldFlex: getComputedStyle(f).flex, fieldMinW: getComputedStyle(f).minWidth, fieldWidth: getComputedStyle(f).width });
})()`));
await sleep(1500);
console.log("== quiz-question ==", JSON.stringify(await ev(OVERFLOW)));
res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(join(OUT, "quiz-question.png"), Buffer.from(res.result.data, "base64"));

// 答题后（会渲染 quiz-actions 与错题状态）
await clickAt(`document.querySelector(".options .option")`);
await sleep(900);
console.log("== quiz-answered ==", JSON.stringify(await ev(OVERFLOW)));
res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(join(OUT, "quiz-answered.png"), Buffer.from(res.result.data, "base64"));

chrome.kill();
process.exit(0);
