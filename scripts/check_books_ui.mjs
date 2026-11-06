/* 浏览器回归：多词书弹框 / 切换 / 记忆 / 例句 / 组件一致性 / 移动端（44 项断言）。
   依赖：本机 Chrome；先 `npm run build`，再启动 `python -m http.server 8773 --directory out`。
   用法：node scripts/check_books_ui.mjs  —— 截图输出到 shots/book-picker/（已被 .gitignore 忽略） */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9341;
const BASE = "http://127.0.0.1:8773/";
const OUT = "shots/book-picker";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), "book-picker-" + Date.now());
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
const waitFor = async (expr, timeout = 8000) => {
  for (let i = 0; i < timeout / 200; i++) {
    if (await ev(expr)) return true;
    await sleep(200);
  }
  return false;
};
const go = async (page) => {
  await ev(`document.querySelector('[data-page="${page}"]').click()`);
  await sleep(500);
};
const stored = () => ev(`JSON.parse(localStorage.getItem("wordsInBloomData") || "{}")`);

/* ---- 1. 首访：强制选书弹框 ---- */
await send("Page.navigate", { url: BASE });
await waitFor(`!!document.querySelector(".book-picker-modal.show")`);
await sleep(400);
check("首访自动弹出选书弹框", await ev(`!!document.querySelector(".book-picker-modal.show")`));
check("弹框列出两本词书", (await ev(`document.querySelectorAll(".book-card").length`)) === 2);
check("标题为「选择今天要读的词书」", (await ev(`document.getElementById("bookPickerTitle")?.textContent`)) === "选择今天要读的词书");
check("首访不可关闭（无返回按钮）", await ev(`!document.querySelector(".book-picker-foot")`));
check("弹框显示词数与进度条", await ev(`document.querySelectorAll(".book-card .path-bar").length === 2`));
check("书卡片沿用文本块玻璃样式", await ev(`document.querySelectorAll(".book-card.journal-card").length === 2`));
check("书卡片无突兀纯色左边框", await ev(`(() => { const s = getComputedStyle(document.querySelector(".book-card")); return s.borderLeftWidth === s.borderTopWidth && s.borderLeftColor === s.borderTopColor; })()`));
check("CTA 按钮为纯色（无渐变）", await ev(`!getComputedStyle(document.querySelector(".book-card-cta")).backgroundImage.includes("gradient")`));
check("顶栏导航标签保持单行", await ev(`[...document.querySelectorAll("#topNav em")].every(e => e.getClientRects().length === 1)`));
check("顶栏内容未横向溢出", await ev(`(() => { const t = document.querySelector(".topbar"); return t.scrollWidth <= t.clientWidth + 2; })()`));
await shot("01-first-visit.png");

/* Esc 不应关闭首访弹框 */
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(300);
check("Esc 无法关闭首访弹框", await ev(`!!document.querySelector(".book-picker-modal.show")`));

/* 首帧持久化不应写出错误形状 */
const s0 = await stored();
check("首访存储 activeBookId 为 null", s0?.activeBookId === null, JSON.stringify(s0?.activeBookId));

/* ---- 2. 选择词组书 ---- */
await ev(`document.querySelectorAll(".book-card")[1].click()`);
await waitFor(`document.querySelector(".sync-status")?.textContent.includes("真题词组")`, 12000);
await sleep(500);
check("选书后弹框关闭", await ev(`!document.querySelector(".book-picker-modal.show")`));
check("顶栏显示当前词书", (await ev(`document.querySelector(".book-switch-name")?.textContent`)) === "真题词组");
const s1 = await stored();
check("localStorage 记住所选词书", s1?.activeBookId === "phrases-764", String(s1?.activeBookId));
check("分桶存储形状正确", s1?.v === 3 && typeof s1?.books === "object" && !("words" in s1));
await shot("02-phrases-home.png");

/* ---- 3. 词组书内容适配 ---- */
await go("library");
const count = await ev(`document.querySelector(".count")?.textContent`);
check("词典库显示 39 页词集 / 764 条", count?.includes("39") && count?.includes("764"), count);
check("分类筛选改为「全部分类」", await ev(`document.querySelector('select[aria-label="按分类筛选"] option')?.textContent === "全部分类"`));
check("分类项含标签派生值", await ev(`[...document.querySelectorAll('select[aria-label="按分类筛选"] option')].some(o => o.textContent === "固定用法")`));
check("释义无残留 <br> 字面量", await ev(`![...document.querySelectorAll(".word-card .meaning, .study-meaning")].some(e => e.textContent.includes("<br>"))`));

await go("study");
const exampleEn = await ev(`document.querySelector(".study-card .example-en")?.textContent`);
const exampleZh = await ev(`document.querySelector(".study-card .example-zh")?.textContent`);
check("沉浸学习卡展示英文例句", !!exampleEn, exampleEn);
check("沉浸学习卡展示中文译文", !!exampleZh, exampleZh);
check("词组书无音标时不显示音标", await ev(`!document.querySelector(".study-card .phonetic")`));
await shot("03-phrases-study.png");
const s2 = await stored();
check("学习行为写入词组书桶", Object.keys(s2?.books?.["phrases-764"]?.words || {}).length > 0);

await go("flash");
await ev(`document.querySelector(".flip-card")?.click()`);
await sleep(400);
check("记忆卡片背面展示例句", await ev(`!!document.querySelector(".face.back .example-block.compact")`));
await shot("04-phrases-flash.png");

await go("quiz");
const hint = await ev(`document.querySelector(".quiz-setup .hint")?.textContent`);
check("词组书测验不出拼写题", hint?.includes("不出拼写题"), hint?.slice(0, 60));
await ev(`document.querySelector(".quiz-setup .pill.primary")?.click()`);
await sleep(500);
check("题目确实没有拼写填空", await ev(`!document.body.textContent.includes("拼写填空")`));

await go("home");
check("首页隐藏「长期学习路径」模块", await ev(`![...document.querySelectorAll(".journal-card h3")].some(h => h.textContent.includes("长期学习路径"))`));

/* ---- 4. 刷新后记住词书 ---- */
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelector(".sync-status")?.textContent.includes("真题词组")`, 12000);
await sleep(400);
check("刷新后不再弹选书框", await ev(`!document.querySelector(".book-picker-modal")`));
check("刷新后仍在同一本词书", (await ev(`document.querySelector(".book-switch-name")?.textContent`)) === "真题词组");

/* ---- 5. 顶栏切换 + 进度隔离 ---- */
await ev(`document.querySelector(".book-switch-btn").click()`);
await sleep(400);
check("顶栏可重开切换弹框", await ev(`!!document.querySelector(".book-picker-modal.show")`));
check("切换弹框有返回按钮", await ev(`!!document.querySelector(".book-picker-foot")`));
check("当前词书标「正在使用」", await ev(`document.querySelectorAll(".book-card")[1]?.classList.contains("active") && !!document.querySelectorAll(".book-card")[1].querySelector(".book-current")`));
check("进度条显示已学数量", await ev(`/已学 [1-9]/.test(document.querySelectorAll(".book-card")[1]?.textContent || "")`));
await shot("05-switch-dialog.png");

await ev(`document.querySelectorAll(".book-card")[0].click()`);
await waitFor(`document.querySelector(".sync-status")?.textContent.includes("3500 词")`, 12000);
await sleep(400);
const s3 = await stored();
check("切回 3500 词书", s3?.activeBookId === "words-3500");
check("词组书进度仍独立保留", Object.keys(s3?.books?.["phrases-764"]?.words || {}).length > 0);
await go("quiz");
check("3500 书恢复拼写题", (await ev(`document.querySelector(".quiz-setup .hint")?.textContent`))?.includes("拼写混合"));
await go("home");
check("3500 书恢复「长期学习路径」", await ev(`[...document.querySelectorAll(".journal-card h3")].some(h => h.textContent.includes("长期学习路径"))`));

/* ---- 6. v2 旧进度迁移（真实浏览器） ---- */
await ev(`localStorage.setItem("wordsInBloomData", ${JSON.stringify(JSON.stringify({
  v: 2,
  words: { 1: { status: "mastered", favorite: true, correctStreak: 2 }, 42: { status: "learning" } },
  dates: ["2026-11-05"],
  lastWordId: 42,
  studyCollectionId: "group-03",
  quizCursor: true,
  pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null },
}))})`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelector(".sync-status")?.textContent.includes("3500 词")`, 12000);
await sleep(400);
const s4 = await stored();
check("v2 旧进度自动迁移为 v3", s4?.v === 3 && s4?.activeBookId === "words-3500");
check("迁移后旧学习状态未丢", s4?.books?.["words-3500"]?.words?.["1"]?.status === "mastered" && s4?.books?.["words-3500"]?.words?.["42"]?.status === "learning");
check("迁移后连续天数保留", (s4?.dates || []).includes("2026-11-05"));
check("迁移后不弹选书框", await ev(`!document.querySelector(".book-picker-modal")`));

/* ---- 7. 暗色 + 移动端 ---- */
await ev(`document.documentElement.dataset.theme = "dark"`);
await ev(`document.querySelector(".book-switch-btn").click()`);
await sleep(400);
await shot("06-dark-dialog.png");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(500);
await shot("07-mobile-dialog.png");
check("移动端弹框可见且不溢出", await ev(`(() => { const d = document.querySelector(".book-picker"); if (!d) return false; const r = d.getBoundingClientRect(); return r.width <= innerWidth && r.height <= innerHeight * 0.9; })()`));

const errors = await ev(`JSON.stringify(window.__errors || [])`);
check("无运行时 JS 异常", errors === "[]", String(errors));

console.log(`\n结果：${results.filter((r) => r.ok).length}/${results.length} 通过`);
chrome.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);
