/* 浏览器回归：记忆卡片「待复习 → 已掌握」一键出队（feat-015）。
   自包含：优先复用 8773 静态预览（校验响应就是 out/index.html），否则自己起一个 8774；
   启动无头 Chrome 用 CDP 真实点击，结束后关闭。
   用法：npm run build && node scripts/check_flash_mastered.mjs
   截图输出到 shots/flash-mastered/（已被 .gitignore 忽略）。 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9342;
const OUT = "shots/flash-mastered";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const localHtml = readFileSync("out/index.html", "utf8");

let BASE = "http://127.0.0.1:8773/";
let server = null;
const usable = async (url) => {
  try {
    const r = await fetch(url);
    return r.ok && (await r.text()) === localHtml;
  } catch { return false; }
};
if (!(await usable(BASE))) {
  BASE = "http://127.0.0.1:8774/";
  server = spawn("python", ["-m", "http.server", "8774", "--directory", "out"], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await usable(BASE)); i++) await sleep(200);
  if (!(await usable(BASE))) { console.error("静态预览启动失败"); server.kill(); process.exit(1); }
}

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), "flash-mastered-" + Date.now());
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
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__errors=[];addEventListener('error',e=>window.__errors.push(String(e.message)));addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));`,
});

const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return "ERR:" + JSON.stringify(r.result.exceptionDetails);
  return r.result?.result?.value;
};
const shot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name), Buffer.from(res.result.data, "base64"));
};
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok: !!ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
};
const waitFor = async (expr, timeout = 10000) => {
  for (let i = 0; i < timeout / 200; i++) {
    if (await ev(expr)) return true;
    await sleep(200);
  }
  return false;
};
const stored = () => ev(`JSON.parse(localStorage.getItem("wordsInBloomData") || "{}")`);
const words = () => ev(`JSON.parse(localStorage.getItem("wordsInBloomData") || "{}").books?.["words-3500"]?.words || {}`);
const counter = () => ev(`document.querySelector(".section-head .count")?.textContent.replace(/\\s+/g, " ").trim()`);
const navText = () => ev(`[...document.querySelectorAll(".flash-nav .pill")].map(b => b.textContent.trim()).join(" | ")`);
const cardNo = () => ev(`document.querySelector(".flip-card .badge.num")?.textContent.trim()`);
const setFilter = (value) => ev(`(() => {
  const s = document.querySelector('select[aria-label="按状态筛选"]');
  if (!s) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(value)});
  s.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
const clickMaster = () => ev(`(() => {
  const b = [...document.querySelectorAll(".flash-nav .pill")].find(x => x.textContent.includes("标为已掌握"));
  if (!b) return false;
  b.click(); return true;
})()`);

/* ---- 0. 造数据：3 个待复习词 + 1 个学习中词，跳过选书弹框 ---- */
const seed = {
  v: 3,
  activeBookId: "words-3500",
  books: {
    "words-3500": {
      words: {
        1: { status: "review", reviewAt: Date.now() + 3600e3, correctStreak: 0 },
        2: { status: "review", reviewAt: Date.now() + 3600e3, correctStreak: 0 },
        3: { status: "review", reviewAt: Date.now() + 3600e3, correctStreak: 0 },
        4: { status: "learning", correctStreak: 1 },
      },
      lastWordId: null,
      studyCollectionId: "all",
    },
  },
  dates: [],
  quizCursor: true,
  pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null },
};
await send("Page.navigate", { url: BASE });
await waitFor(`!!document.querySelector("[data-page='flash']")`, 12000);
await ev(`localStorage.setItem("wordsInBloomData", ${JSON.stringify(JSON.stringify(seed))})`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`!!document.querySelector("[data-page='flash']")`, 12000);
await sleep(400);
check("注入 v3 进度后不弹选书框", await ev(`!document.querySelector(".book-picker-modal")`));

await ev(`document.querySelector('[data-page="flash"]').click()`);
await waitFor(`!!document.querySelector(".flip-card")`, 8000);
await sleep(300);
const allCount = String(await counter());
check("默认全部状态覆盖整本词书", /^1 \/ \d+$/.test(allCount) && Number(allCount.split("/")[1].trim()) > 3000, allCount);
check("默认池里的待复习 #1 同样显示「标为已掌握」", (await cardNo()) === "#1" && (await navText())?.includes("标为已掌握"), String(await navText()));

/* ---- 1. 按待复习筛选：按钮换成「标为已掌握」 ---- */
check("状态筛选切换成功", await setFilter("review"));
await sleep(350);
check("待复习池共 3 张、计数 1 / 3", (await counter()) === "1 / 3", String(await counter()));
check("待复习卡片显示「标为已掌握」", (await navText())?.includes("标为已掌握"), String(await navText()));
check("待复习卡片不再显示「去沉浸学习」", !(await navText())?.includes("去沉浸学习"));
check("CTA 复用 .pill 且无渐变", await ev(`(() => {
  const b = document.querySelector(".flash-nav .pill.mastered-cta");
  if (!b) return false;
  const s = getComputedStyle(b);
  return s.backgroundImage === "none" && s.borderTopWidth !== "0px";
})()`));
await shot("01-review-cta.png");

/* ---- 2. 点击：写 mastered、清排期、出队、自动落到下一张 ---- */
check("第一张是 #1", (await cardNo()) === "#1", String(await cardNo()));
check("点击「标为已掌握」", await clickMaster());
await sleep(450);
const w1 = (await words())?.["1"];
check("#1 状态写入 mastered", w1?.status === "mastered", JSON.stringify(w1));
check("#1 复习排期清空且连对计数置 2", w1?.reviewAt == null && w1?.correctStreak === 2, JSON.stringify(w1));
check("待复习池减为 2、计数 1 / 2", (await counter()) === "1 / 2", String(await counter()));
check("自动落到下一张 #2", (await cardNo()) === "#2", String(await cardNo()));
check("#2 仍是待复习、按钮仍可点", (await words())?.["2"]?.status === "review" && (await navText())?.includes("标为已掌握"));
await shot("02-after-click.png");

/* ---- 3. 清空队列：末位索引收敛，不出现空白卡 / 越界计数 ---- */
await clickMaster(); await sleep(350);
check("第三张出队后计数 1 / 1", (await counter()) === "1 / 1", String(await counter()));
check("末位卡片为 #3", (await cardNo()) === "#3", String(await cardNo()));
await clickMaster(); await sleep(400);
check("队列清空后显示空状态", await ev(`!!document.querySelector(".empty.glass")`));
check("队列清空后不残留卡片按钮区", await ev(`!document.querySelector(".flash-nav")`));
check("队列清空后计数显示 0 / 0", (await counter()) === "0 / 0", String(await counter()));

/* ---- 4. 全部状态下：已掌握态 / 学习中态各自正确 ---- */
await setFilter("all"); await sleep(400);
check("已掌握卡片显示完成态「✓ 已掌握」且禁用", await ev(`(() => {
  const b = [...document.querySelectorAll(".flash-nav .pill")].find(x => x.textContent.includes("已掌握"));
  return !!b && b.disabled && !b.textContent.includes("标为");
})()`), String(await navText()));
for (let i = 0; i < 3; i++) { await ev(`document.querySelector(".flash-nav .round-btn:last-child").click()`); await sleep(300); }
check("学习中卡片保留「去沉浸学习」", (await cardNo()) === "#4" && (await navText())?.includes("去沉浸学习"), `${await cardNo()} / ${await navText()}`);
check("其它词状态未被改写", (await words())?.["4"]?.status === "learning");
await shot("03-mastered-and-learning.png");

/* ---- 5. 刷新持久化 + 首页统计 ---- */
await send("Page.reload", { ignoreCache: true });
await waitFor(`!!document.querySelector("[data-page='home']")`, 12000);
await sleep(400);
const after = await stored();
check("刷新后三张已掌握进度仍在", [1, 2, 3].every((i) => after?.books?.["words-3500"]?.words?.[i]?.status === "mastered"));
check("刷新后其它词进度未丢", after?.books?.["words-3500"]?.words?.["4"]?.status === "learning");
check("刷新后 activeBookId 保持", after?.activeBookId === "words-3500" && after?.v === 3);
check("首页已掌握统计为 3", await ev(`(() => {
  const b = [...document.querySelectorAll(".stat")].find(x => x.textContent.includes("已掌握"));
  return !!b && b.textContent.includes("3");
})()`));

/* ---- 6. 暗色 / 移动端 / 无异常 ---- */
await ev(`document.querySelector('[data-page="flash"]').click()`);
await waitFor(`!!document.querySelector(".flip-card")`, 8000);
await setFilter("all"); await sleep(300);
await ev(`document.documentElement.dataset.theme = "dark"`);
await sleep(250);
check("暗色下 CTA 仍为纯色无渐变", await ev(`(() => {
  const b = document.querySelector(".flash-nav .pill");
  return !!b && getComputedStyle(b).backgroundImage === "none";
})()`));
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(400);
await shot("04-mobile.png");
check("移动端按钮区不横向溢出", await ev(`(() => {
  const n = document.querySelector(".flash-nav");
  if (!n) return false;
  const r = n.getBoundingClientRect();
  return r.left >= 0 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
})()`));
const errors = await ev(`JSON.stringify(window.__errors || [])`);
check("无运行时 JS 异常", errors === "[]", String(errors));

console.log(`\n结果：${results.filter((r) => r.ok).length}/${results.length} 通过`);
chrome.kill();
server?.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);
