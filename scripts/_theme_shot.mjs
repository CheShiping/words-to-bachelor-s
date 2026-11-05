import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9335;
const BASE = "http://localhost:3000/";
const OUT = "shots/theme";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), "theme-" + Date.now());
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

const SEED = `(() => { const w = {}; for (let i = 1; i <= 40; i++) w[i] = { status: "learning", favorite: i % 7 === 0, reviewAt: Date.now() + 86400000, correctStreak: 0 }; localStorage.setItem("wordsInBloomData", JSON.stringify({ v: 2, words: w, dates: [], lastWordId: 5, studyCollectionId: "all", motion: false, quizCursor: false, pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null } })); return 1; })()`;

await send("Page.navigate", { url: BASE });
await sleep(9000);
await ev(SEED);
await send("Page.reload", { ignoreCache: true });
await sleep(7000);

const shot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(res.result.data, "base64"));
  console.log("shot", name);
};

const go = async (page) => {
  await ev(`(() => { const b = document.querySelector('#bottomNav [data-page="${page}"]'); if (b) b.click(); return 1; })()`);
  await sleep(1400);
};

console.log("theme attr before:", await ev(`document.documentElement.dataset.theme`));
await shot("light-home");
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-color-scheme", value: "dark" }],
});
await ev(`localStorage.removeItem("wordsInBloomTheme")`);
await send("Page.reload", { ignoreCache: true });
await sleep(6000);
console.log("system-pref default:", await ev(`document.documentElement.dataset.theme`));
await go("quiz");
await shot("dark-quiz");
await ev(`(() => { const b = Array.from(document.querySelectorAll(".tools button")).pop(); if (b) b.click(); return 1; })()`);
await sleep(800);
await shot("dark-modal");
await ev(`(() => { const b = Array.from(document.querySelectorAll(".dialog .pill")).find(x => x.textContent.includes("取消")); if (b) b.click(); return 1; })()`);
await sleep(500);

// 点击顶栏主题按钮
await ev(`(() => { const b = document.querySelector(".theme-btn"); if (!b) return "no button"; b.click(); return "ok"; })()`);
await sleep(900);
console.log("theme attr after:", await ev(`document.documentElement.dataset.theme`));
console.log("stored:", await ev(`localStorage.getItem("wordsInBloomTheme")`));
await shot("dark-home");

await go("library");
await shot("dark-library");
await go("study");
await shot("dark-study");
await go("flash");
await shot("dark-flash");

// 刷新后主题是否保持
await send("Page.reload", { ignoreCache: true });
await sleep(6000);
console.log("theme after reload:", await ev(`document.documentElement.dataset.theme`));
console.log("body bg:", await ev(`getComputedStyle(document.body).backgroundColor`));

chrome.kill();
process.exit(0);
