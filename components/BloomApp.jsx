"use client";

/* ============================================================
 * 词间日和 · Words in Bloom（专升本单词版）
 * 依据逆向分析报告复刻：无后端纯静态，进度只存当前浏览器。
 * 动效分层：CSS keyframes（氛围）/ WAAPI element.animate（卡片切换）
 *          / GSAP（页面编排、导航胶囊、数字滚动、测验瞄准光标）
 * ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import gsap from "gsap";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const REPO_URL = "https://github.com/CheShiping/words-to-bachelor-s";
const STORAGE_KEY = "wordsInBloomData";
const PAGE_SIZE = 60;
const CARD_SWITCH_EXIT_MS = 50;
const CARD_SWITCH_ENTER_MS = 70;
const REVIEW_STAGE_HOURS = [4, 24, 72, 168, 336, 720];
const PAGES = [
  ["home", "首页", "⌂"],
  ["library", "词典库", "册"],
  ["study", "沉浸学习", "◎"],
  ["flash", "记忆卡片", "▭"],
  ["quiz", "记忆测试", "✓"],
  ["favorites", "收藏夹", "♡"],
];
const STATUS_LABEL = { new: "未学", learning: "学习中", review: "待复习", mastered: "已掌握" };

/* ---------- 小工具 ---------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
// 音标展示：原表里部分音标自带结尾的 "/"（如 dinosaur），避免出现双斜杠
const phoneticOf = (w) => {
  const p = (w && w.phonetic) || "";
  if (!p) return "";
  return p.startsWith("/") ? p : `/${p}/`;
};
const shuffleWith = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};
const shuffled = (list, seed = Date.now() >>> 0) => {
  const rand = shuffleWith(seed);
  return [...list].sort(() => rand() - 0.5);
};
const dayKey = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const beijingParts = () => {
  const fmt = (opts) =>
    new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, ...opts });
  const date = fmt({ year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const time = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  const m = date.match(/^(.+)(星期.)$/);
  return { date: m ? `${m[1]} · ${m[2]}` : date, time };
};

/* ---------- 用户数据 ---------- */
const defaultUserData = () => ({
  v: 2,
  words: {}, // id -> { status, favorite, reviewAt, correctStreak }
  dates: [],
  lastWordId: null,
  studyCollectionId: "all",
  quizCursor: true,
  pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null },
});
const loadLocalUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUserData();
    const parsed = JSON.parse(raw);
    // 词库已从考研切换为专升本，旧进度与新的词条 id 不匹配，直接重置
    if (!parsed || parsed.v !== defaultUserData().v) return defaultUserData();
    return { ...defaultUserData(), ...parsed, pomodoro: { ...defaultUserData().pomodoro, ...(parsed.pomodoro || {}) } };
  } catch {
    return defaultUserData();
  }
};
const wordState = (user, id) => user.words[id] || {};
const withStatus = (user, word) => {
  const ws = user.words[word.id];
  return {
    ...word,
    status: ws?.status || "new",
    favorite: !!ws?.favorite,
    reviewAt: ws?.reviewAt || null,
    correctStreak: ws?.correctStreak || 0,
  };
};
const touchDate = (user) => {
  const key = dayKey();
  return user.dates.includes(key) ? user : { ...user, dates: [...user.dates.slice(-400), key] };
};
const streakDays = (dates) => {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let days = 0;
  while (set.has(dayKey(cursor))) {
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
};
const mulberryHash = (id, seed) => {
  let t = (id * 374761393 + seed * 668265263) >>> 0;
  t = (t ^ (t >>> 13)) >>> 0;
  t = Math.imul(t, 1274126177) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
};

/* ---------- 筛选 ---------- */
function applyFilters(words, filters, { favoriteOnly = false } = {}) {
  const kw = (filters.keyword || "").trim().toLowerCase();
  let list = words.filter((w) => {
    if (favoriteOnly && !w.favorite) return false;
    if (filters.collection && filters.collection !== "all" && w.collectionId !== filters.collection) return false;
    if (filters.category && filters.category !== "all" && w.category !== filters.category) return false;
    if (filters.status && filters.status !== "all") {
      if (filters.status === "favorite" ? !w.favorite : w.status !== filters.status) return false;
    }
    if (kw && !(w.word.toLowerCase().includes(kw) || w.meaning.toLowerCase().includes(kw))) return false;
    return true;
  });
  if (filters.sort === "alpha") list = [...list].sort((a, b) => a.word.localeCompare(b.word));
  else if (filters.sort === "random") list = [...list].sort((a, b) => mulberryHash(a.id, filters.seed) - mulberryHash(b.id, filters.seed));
  else if (filters.sort === "review")
    list = [...list].sort((a, b) => (a.reviewAt || Infinity) - (b.reviewAt || Infinity));
  else if (filters.sort === "favorite") list = [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return list;
}

/* ---------- 花瓣粒子层（确定性播种 + CSS 变量） ---------- */
function petalNoise(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function usePetalLayers(motionEnabled) {
  const backRef = useRef(null);
  const midRef = useRef(null);
  const frontRef = useRef(null);
  useEffect(() => {
    const fields = [
      [backRef.current, 12, 8, 16, 0.18, 0.34, 16, 29, 0],
      [midRef.current, 8, 12, 23, 0.3, 0.56, 13, 23, 1],
      [frontRef.current, 4, 20, 37, 0.44, 0.76, 11, 19, 2],
    ];
    if (!motionEnabled) {
      fields.forEach(([field]) => field && (field.innerHTML = ""));
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = window.innerWidth <= 700 || window.matchMedia("(pointer: coarse)").matches;
    const scale = reduced ? [0.25, 0.25, 0.25] : compact ? [0.5, 0.5, 0.5] : [1, 1, 1];
    fields.forEach(([field, count, minSize, maxSize, minOpa, maxOpa, minDur, maxDur, layer], i) => {
      if (!field) return;
      const frag = document.createDocumentFragment();
      const n = Math.max(1, Math.round(count * scale[i]));
      for (let index = 0; index < n; index++) {
        const seed = index + layer * 41;
        const size = minSize + petalNoise(seed, 1) * (maxSize - minSize);
        const duration = minDur + petalNoise(seed, 2) * (maxDur - minDur);
        const wind = -8 + petalNoise(seed, 3) * 16;
        const petal = document.createElement("i");
        petal.className = "petal";
        const style = petal.style;
        style.setProperty("--petal-x", `${1 + petalNoise(seed, 4) * 98}%`);
        style.setProperty("--petal-static-y", `${4 + petalNoise(seed, 5) * 90}%`);
        style.setProperty("--petal-size", `${size.toFixed(1)}px`);
        style.setProperty("--petal-height", `${(size * 1.44).toFixed(1)}px`);
        style.setProperty("--petal-opacity", (minOpa + petalNoise(seed, 6) * (maxOpa - minOpa)).toFixed(2));
        style.setProperty("--petal-duration", `${duration.toFixed(2)}s`);
        style.setProperty("--petal-delay", `${(-petalNoise(seed, 7) * duration).toFixed(2)}s`);
        style.setProperty("--petal-wind-a", `${(wind * 0.58 + petalNoise(seed, 8) * 4).toFixed(2)}vw`);
        style.setProperty("--petal-wind-b", `${(-wind * 0.34 + petalNoise(seed, 9) * 5 - 2.5).toFixed(2)}vw`);
        style.setProperty("--petal-wind-c", `${(wind + petalNoise(seed, 10) * 6 - 3).toFixed(2)}vw`);
        frag.append(petal);
      }
      field.replaceChildren(frag);
    });
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.dispatchEvent(new Event("petal-resync")), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [motionEnabled]);
  return { backRef, midRef, frontRef };
}

/* ---------- 数字滚动（IntersectionObserver + GSAP，周期号防重播） ---------- */
function CountUp({ value, suffix = "" }) {
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const render = (v) => (el.textContent = Math.round(v).toLocaleString("en-US") + suffix);
    if (started.current && started.current.key === value) return;
    started.current = { key: value };
    const start = value > 50 ? Math.max(0, value - Math.max(18, value * 0.24)) : 0;
    if (!window.gsap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      render(value);
      return;
    }
    const counter = { v: start };
    render(start);
    gsap.to(counter, {
      v: value,
      duration: 1,
      ease: "power3.out",
      onUpdate: () => render(counter.v),
      onComplete: () => render(value),
    });
  }, [value, suffix]);
  return <b className="home-count" ref={ref}>0{suffix}</b>;
}

/* ---------- WAAPI 卡片横向切换（50ms 出 / 70ms 入，两页唯一的一套时序） ----------
 * commit() 必须同步生效：旧实现里 React 状态更新是异步的，getCurrent() 在 commit()
 * 之后拿到的仍是即将卸载的旧卡片，入场动画挂错了元素 —— 新卡片会「空一帧 + 瞬间弹出」，
 * 看起来就是切换时抖一下。用 flushSync 提交后立刻给在场的新卡片挂入场动画即可根除。 */
async function switchCard(getCurrent, commit, direction, isActivePage, startOffset = 0) {
  const current = getCurrent();
  if (!current || !current.animate || document.body.classList.contains("no-motion")) {
    flushSync(commit);
    return;
  }
  // 手指离开时卡片所在的位置作为离场起点，动画方向与滑动方向一致，不会先"退回去"
  const width = current.getBoundingClientRect().width || 320;
  const travel = Math.max(34, width * 0.08);
  const sign = direction > 0 ? -1 : 1;
  const exitFrom = startOffset;
  const exitTo = startOffset + sign * Math.max(travel, Math.abs(startOffset) * 0.35);
  current.style.pointerEvents = "none";
  // 接管之前先撤销残留的回弹过渡 / 上一次切换动画，避免两层 transform 打架
  current.getAnimations().forEach((a) => a.cancel());
  let exit = null;
  let enter = null;
  try {
    exit = current.animate(
      [
        { opacity: 1, transform: `translate3d(${exitFrom}px,0,0) scale(1)` },
        { opacity: 0, transform: `translate3d(${exitTo}px,0,0) scale(0.985)` },
      ],
      { duration: CARD_SWITCH_EXIT_MS, easing: "cubic-bezier(0.4,0,0.65,1)", fill: "both" },
    );
    await exit.finished.catch(() => {});
    if (!isActivePage()) return;
    // 先撤销离场的 forwards 填充，再同步换内容：同一个任务内完成，不会露出中间帧
    exit.cancel();
    exit = null;
    flushSync(commit);
    const incoming = getCurrent();
    if (!incoming) return;
    // 入场统一「原地淡入」：两个方向完全一致，且新卡片零位移，
    // 不会像旧实现那样在「下一个 / 左滑」时从右侧冲进视口、把页面撑出横向滚动条。
    // fill:both 让第一帧的 opacity:0 立刻生效，杜绝新卡片先闪现再开始动画。
    enter = incoming.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: CARD_SWITCH_ENTER_MS, easing: "cubic-bezier(0.2,0.72,0.25,1)", fill: "both" },
    );
    await enter.finished.catch(() => {});
  } finally {
    if (exit) exit.cancel();
    if (enter) enter.cancel();
    const now = getCurrent();
    if (now) now.style.pointerEvents = "";
  }
}

/* ---------- 触摸滑动：左右滑动切换卡片 ---------- */
// 卡片区最近一次手势的时间戳。卡片容器在回弹过渡中时几何位置是偏的，
// 仅靠命中测试判断会漏，用时间窗兜底：卡片刚滑过就不触发翻页。
let lastCardGestureAt = 0;

function useSwipeDeck(deckEl, { getDragEl, onSwipe, threshold = 56, ignoreSelector = "", ignoreZone, role = "card" } = {}) {
  const gesture = useRef(null);
  const swipeRef = useRef(onSwipe);
  const dragRef = useRef(getDragEl);
  const ignoreRef = useRef(ignoreSelector);
  const zoneRef = useRef(ignoreZone);
  const roleRef = useRef(role);
  swipeRef.current = onSwipe;
  dragRef.current = getDragEl;
  ignoreRef.current = ignoreSelector;
  zoneRef.current = ignoreZone;
  roleRef.current = role;

  useEffect(() => {
    if (!deckEl) return;
    const dragEl = () => (dragRef.current ? dragRef.current() : deckEl);

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const now = Date.now();
      if (roleRef.current === "page") {
        // 刚在卡片区滑过，这一下不算翻页
        if (now - lastCardGestureAt < 400) return;
      } else {
        lastCardGestureAt = now;
      }
      const ignore = ignoreRef.current;
      if (ignore) {
        // closest 会命中容器自身（.main 本身就是 swipe-deck），这里只排除真正的嵌套区域
        const hit = e.target?.closest?.(ignore);
        if (hit && hit !== deckEl) return;
      }
      const t = e.touches[0];
      // 卡片切换动画期间会临时 pointer-events:none，触摸会穿透到页面层，
      // 这里再用几何范围兜一次：起点落在卡片区内就不触发翻页
      const zone = zoneRef.current?.();
      if (zone) {
        const r = zone.getBoundingClientRect();
        if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) return;
      }
      gesture.current = { x: t.clientX, y: t.clientY, dragging: false };
    };

    const onTouchMove = (e) => {
      const g = gesture.current;
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.dragging) {
        if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy)) return;
        g.dragging = true;
        const el = dragEl();
        if (el) el.classList.add("is-swiping");
      }
      const el = dragEl();
      if (!el) return;
      const damp = dx * 0.55;
      el.classList.add("has-offset");
      el.style.setProperty("--swipe-x", `${damp.toFixed(1)}px`);
      el.style.setProperty("--swipe-rot", `${(damp * 0.03).toFixed(2)}deg`);
      el.style.setProperty("--swipe-o", String(Math.max(0.45, 1 - Math.abs(dx) / 1100)));
    };

    const onTouchEnd = (e) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.dragging) return; // 普通点击，交给原有 onClick
      const committed = Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy);
      const el = dragEl();
      const clearOffset = (instant) => {
        if (!el) return;
        if (instant) el.style.transitionDuration = "0ms";
        el.classList.remove("has-offset");
        el.style.removeProperty("--swipe-x");
        el.style.removeProperty("--swipe-rot");
        el.style.removeProperty("--swipe-o");
        if (instant) {
          requestAnimationFrame(() => {
            el.style.transitionDuration = "";
            el.classList.remove("is-swiping");
          });
        }
      };
      if (el) {
        if (committed) {
          // 提交切换：立即归位，离场动画从同一个偏移量接管，视觉上无缝衔接
          clearOffset(true);
        } else {
          // 未提交：平滑回弹到原位
          el.classList.remove("is-swiping");
          clearOffset(false);
        }
      }
      // 滑动结束后浏览器会补发 click，这里短暂截断一次，避免误触卡片里的按钮
      const swallow = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      deckEl.addEventListener("click", swallow, { capture: true });
      setTimeout(() => deckEl.removeEventListener("click", swallow, { capture: true }), 400);
      if (committed) swipeRef.current?.(dx < 0 ? 1 : -1, dx * 0.55);
    };

    deckEl.addEventListener("touchstart", onTouchStart, { passive: true });
    deckEl.addEventListener("touchmove", onTouchMove, { passive: true });
    deckEl.addEventListener("touchend", onTouchEnd);
    deckEl.addEventListener("touchcancel", onTouchEnd);
    return () => {
      deckEl.removeEventListener("touchstart", onTouchStart);
      deckEl.removeEventListener("touchmove", onTouchMove);
      deckEl.removeEventListener("touchend", onTouchEnd);
      deckEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [deckEl, threshold]);
}

/* ---------- 卡片页共用的「手势 + 切换」引擎 ----------
 * 沉浸学习与记忆卡片只传入各自的选择器和提交函数，手势判定、阻尼、阈值、
 * 防连点、出入场时序全部走同一份代码，左右滑行为永远保持一致。 */
function useCardDeck({ containerRef, cardSelector, pool, index, activePage, commit, moveRef }) {
  const busyRef = useRef(false);
  const latest = useRef({ pool, index, activePage, commit });
  latest.current = { pool, index, activePage, commit };

  const move = useCallback(
    (step, offset = 0) => {
      const s = latest.current;
      if (!s.pool.length || busyRef.current) return;
      busyRef.current = true;
      const next = (s.index + step + s.pool.length) % s.pool.length;
      switchCard(
        () => containerRef.current?.querySelector(cardSelector),
        () => latest.current.commit(next),
        step,
        () => latest.current.activePage(),
        offset,
      ).finally(() => {
        busyRef.current = false;
      });
    },
    [containerRef, cardSelector],
  );

  // 方向键走同一个入口、同一把 busy 锁
  if (moveRef) moveRef.current = move;

  const [deckEl, setDeckEl] = useState(null);
  useSwipeDeck(deckEl, {
    getDragEl: () => deckEl?.querySelector(cardSelector),
    onSwipe: (step, offset) => move(step, offset),
  });
  return { move, setDeckEl };
}

/* ============================================================
 * 主组件
 * ============================================================ */
export default function BloomApp() {
  const [catalog, setCatalog] = useState(null);
  const [bootError, setBootError] = useState("");
  const [user, setUser] = useState(defaultUserData);
  const [page, setPage] = useState("home");
  const [modalOpen, setModalOpen] = useState(false);
  const [clock, setClock] = useState({ date: "", time: "--:--:--" });
  const [, setTick] = useState(0); // 番茄钟/时钟每秒重绘
  const [showTop, setShowTop] = useState(false);

  const [lib, setLib] = useState({ collection: "all", category: "all", status: "all", sort: "original", keyword: "", seed: 1, page: 0 });
  const [flash, setFlash] = useState({ collection: "all", status: "all", sort: "original", seed: 1, index: 0, flipped: false });
  const [quizSetup, setQuizSetup] = useState({ collection: "all", category: "all", status: "all", count: 20 });
  const [quiz, setQuiz] = useState(null);

  const loadedRef = useRef(false);
  const sectionRefs = useRef({});
  const quizCursorRef = useRef(null);
  // 动效常驻开启：不再提供开关，避免用户误关后界面失去花瓣与过渡
  const motionEnabled = true;

  /* ---- 词库加载（对应原站 /api/catalog，这里改为静态 JSON） ---- */
  useEffect(() => {
    let alive = true;
    fetch(`${BASE_PATH}/data/catalog.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload) => alive && setCatalog({ collections: payload.collections, words: payload.words }))
      .catch((err) => alive && setBootError(String(err.message || err)));
    return () => {
      alive = false;
    };
  }, []);

  /* ---- 本地持久化 ---- */
  useEffect(() => {
    setUser(loadLocalUser());
    loadedRef.current = true;
  }, []);
  useEffect(() => {
    if (loadedRef.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } catch {}
    }
  }, [user]);

  const patchUser = useCallback((fn) => setUser((prev) => fn(prev)), []);

  /* ---- 全局 body 状态 ---- */
  useEffect(() => {
    document.body.dataset.page = page;
  }, [page]);
  useEffect(() => {
    document.body.classList.toggle("motion-enabled", motionEnabled);
    document.body.classList.toggle("no-motion", !motionEnabled);
  }, [motionEnabled]);
  useEffect(() => {
    const onVis = () => document.body.classList.toggle("page-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* ---- 北京时间时钟 + 每秒 tick ---- */
  useEffect(() => {
    setClock(beijingParts());
    const timer = setInterval(() => {
      setClock(beijingParts());
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---- 返回顶部按钮 ---- */
  useEffect(() => {
    let frame = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        setShowTop(window.scrollY > 500);
        frame = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---- 花瓣 ---- */
  const petals = usePetalLayers(motionEnabled);

  /* ---- 页面切换 ---- */
  const navigate = useCallback((next) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  useEffect(() => {
    const el = sectionRefs.current[page];
    if (!el || page === "library" || !window.gsap || !motionEnabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 34, scale: 0.985, filter: "blur(8px)" },
      { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.72, ease: "power3.out", clearProps: "transform,filter" },
    );
  }, [page, catalog, motionEnabled]);

  /* ---- 首访顶栏入场（timeline + clipPath 揭幕，每会话一次） ---- */
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("wordsInBloomNavigationIntro") === "1";
    } catch {}
    if (seen || !window.gsap || !motionEnabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(".topbar", { autoAlpha: 0, y: -24, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.72, clearProps: "transform" })
      .fromTo(".topbar .brand", { scale: 0, rotate: -8 }, { scale: 1, rotate: 0, duration: 0.58, ease: "back.out(1.8)" }, 0.1)
      .fromTo("#topNav", { clipPath: "inset(0 100% 0 0 round 18px)", x: -12 }, { clipPath: "inset(0 0% 0 0 round 18px)", x: 0, duration: 0.76 }, 0.18)
      .fromTo(".topbar .tools", { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, duration: 0.5 }, 0.32);
    try {
      sessionStorage.setItem("wordsInBloomNavigationIntro", "1");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 导航胶囊聚光灯（几何反解拱形圆 + 双层文字接力） ---- */
  useEffect(() => {
    const nav = document.getElementById("topNav");
    if (!nav || !window.gsap) return;
    const cleanups = [];
    nav.querySelectorAll("button").forEach((button) => {
      const circle = button.querySelector(".nav-hover-circle");
      const label = button.querySelector(".nav-label-copy");
      const hoverLabel = button.querySelector(".nav-label-hover");
      if (!circle || !label || !hoverLabel) return;
      const rect = button.getBoundingClientRect();
      const radius = ((rect.width * rect.width) / 4 + rect.height * rect.height) / (2 * rect.height);
      const diameter = Math.ceil(radius * 2) + 2;
      const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (rect.width * rect.width) / 4))) + 1;
      Object.assign(circle.style, { width: `${diameter}px`, height: `${diameter}px`, bottom: `-${delta}px` });
      const active = button.classList.contains("active");
      gsap.set(circle, { xPercent: -50, scale: active ? 1.18 : 0, transformOrigin: `50% ${diameter - delta}px` });
      gsap.set(label, { y: active ? -(rect.height + 8) : 0 });
      gsap.set(hoverLabel, { y: active ? 0 : rect.height + 12, autoAlpha: active ? 1 : 0 });
      const enter = () => {
        gsap.to(circle, { scale: 1.2, duration: 0.12, ease: "power3.out", overwrite: true });
        gsap.to(label, { y: -(rect.height + 8), duration: 0.11, ease: "power3.out", overwrite: true });
        gsap.to(hoverLabel, { y: 0, autoAlpha: 1, duration: 0.11, ease: "power3.out", overwrite: true });
      };
      const leave = () => {
        if (button.classList.contains("active")) return;
        gsap.to(circle, { scale: 0, duration: 0.1, ease: "power2.out", overwrite: true });
        gsap.to(label, { y: 0, duration: 0.09, ease: "power2.out", overwrite: true });
        gsap.to(hoverLabel, { y: rect.height + 12, autoAlpha: 0, duration: 0.09, ease: "power2.out", overwrite: true });
      };
      button.addEventListener("mouseenter", enter);
      button.addEventListener("mouseleave", leave);
      button.addEventListener("focus", enter);
      button.addEventListener("blur", leave);
      cleanups.push(() => {
        button.removeEventListener("mouseenter", enter);
        button.removeEventListener("mouseleave", leave);
        button.removeEventListener("focus", enter);
        button.removeEventListener("blur", leave);
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [page, catalog]);

  /* ---- 词库派生数据 ---- */
  const allWords = useMemo(() => (catalog ? catalog.words.map((w) => withStatus(user, w)) : []), [catalog, user]);
  const categories = useMemo(
    () => (catalog ? [...new Set(catalog.words.map((w) => w.category))].sort((a, b) => a.localeCompare(b, "zh")) : []),
    [catalog],
  );
  const stats = useMemo(() => {
    const total = allWords.length;
    const mastered = allWords.filter((w) => w.status === "mastered").length;
    const learning = allWords.filter((w) => w.status === "learning").length;
    const review = allWords.filter((w) => w.status === "review").length;
    const due = allWords.filter((w) => w.reviewAt && w.reviewAt <= Date.now() && w.status !== "mastered").length;
    const favorites = allWords.filter((w) => w.favorite).length;
    const learned = total - allWords.filter((w) => w.status === "new").length;
    return {
      total,
      collections: catalog?.collections.length || 0,
      mastered,
      learning,
      review,
      due,
      favorites,
      learned,
      percent: total ? Math.round((learned / total) * 100) : 0,
      streak: streakDays(user.dates),
    };
  }, [allWords, catalog, user.dates]);

  /* ---- 学习行为 ---- */
  const setWordState = useCallback(
    (id, patch, { touch = true } = {}) =>
      patchUser((prev) => {
        const next = touch ? touchDate(prev) : prev;
        const ws = next.words[id] || {};
        return { ...next, words: { ...next.words, [id]: { ...ws, ...patch } } };
      }),
    [patchUser],
  );
  const updateWordStatus = useCallback(
    (id, status) =>
      setWordState(id, {
        status,
        reviewAt: status === "review" ? Date.now() + REVIEW_STAGE_HOURS[2] * 3600e3 : null,
        correctStreak: status === "mastered" ? 2 : 0,
      }),
    [setWordState],
  );
  const toggleFavorite = useCallback((id) => {
    const cur = user.words[id] || {};
    setWordState(id, { favorite: !cur.favorite }, { touch: false });
  }, [setWordState, user.words]);
  const markStudy = useCallback(
    (id) => {
      const ws = user.words[id] || {};
      const patch = {};
      if (!ws.status || ws.status === "new") patch.status = "learning";
      setWordState(id, patch);
      patchUser((prev) => ({ ...prev, lastWordId: id }));
    },
    [setWordState, patchUser, user.words],
  );
  const scheduleReview = useCallback(
    (id, ok) => {
      const ws = user.words[id] || {};
      if (ok) {
        const streak = (ws.correctStreak || 0) + 1;
        const mastered = streak >= 2;
        setWordState(id, {
          correctStreak: streak,
          status: mastered ? "mastered" : ws.status && ws.status !== "new" ? ws.status : "learning",
          reviewAt: mastered ? null : Date.now() + REVIEW_STAGE_HOURS[clamp(streak, 0, 5)] * 3600e3,
        });
      } else {
        setWordState(id, { correctStreak: 0, status: "review", reviewAt: Date.now() + REVIEW_STAGE_HOURS[0] * 3600e3 });
      }
    },
    [setWordState, user.words],
  );

  /* ---- 全局键盘流 ---- */
  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false);
        return;
      }
      if (typing) {
        if (e.key === "Enter" && e.target.id === "blankAnswer") document.getElementById("submitBlank")?.click();
        return;
      }
      const pool = studyPoolRef.current;
      if (page === "study" && pool?.length) {
        const idx = pool.findIndex((w) => w.id === user.lastWordId);
        const pos = idx < 0 ? 0 : idx;
        if (e.key === "ArrowLeft") moveStudyRef.current(-1);
        if (e.key === "ArrowRight") moveStudyRef.current(1);
        const current = pool[clamp(pos, 0, pool.length - 1)];
        if (current && !typing) {
          if (e.key.toLowerCase() === "m") updateWordStatus(current.id, "mastered");
          if (e.key.toLowerCase() === "r") updateWordStatus(current.id, "review");
          if (e.key.toLowerCase() === "f") toggleFavorite(current.id);
        }
      }
      if (page === "quiz" && quiz && !quiz.done) {
        if (e.key === "ArrowLeft") moveQuizRef.current(-1);
        if (e.key === "ArrowRight") nextQuestionRef.current();
      }
      if (page === "flash") {
        if (e.key === "ArrowLeft") moveFlashRef.current(-1);
        if (e.key === "ArrowRight") moveFlashRef.current(1);
        if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-flip]")) {
          e.preventDefault();
          e.target.click();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [page, quiz, modalOpen, user.lastWordId, updateWordStatus, toggleFavorite]);

  /* ---- 沉浸学习 ---- */
  const studyPoolRef = useRef([]);
  const moveStudyRef = useRef(() => {});
  const moveQuizRef = useRef(() => {});
  const nextQuestionRef = useRef(() => {});
  const moveFlashRef = useRef(() => {});
  const studyCardRef = useRef(null);
  const flashSceneRef = useRef(null);
  const quizCardRef = useRef(null);
  const [quizBusy, setQuizBusy] = useState(false);

  const studyPool = useMemo(() => {
    if (!catalog) return [];
    let pool = allWords.filter((w) => user.studyCollectionId === "all" || w.collectionId === user.studyCollectionId);
    return pool;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, allWords, user.studyCollectionId]);
  studyPoolRef.current = studyPool;

  /* 键盘方向键与触摸滑动共用同一个 move（由页面内的 useCardDeck 回填到 ref），
     因此只存在一份 busy 锁，不会出现两套动画叠加造成的抖动。 */

  /* ---- 记忆卡片 ---- */
  const flashPool = useMemo(() => {
    if (!catalog) return [];
    return applyFilters(allWords, flash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, allWords, flash.collection, flash.status, flash.sort, flash.seed]);
  const flashWord = flashPool[clamp(flash.index, 0, Math.max(0, flashPool.length - 1))];

  /* ---- 记忆测试 ---- */
  const quizPool = useMemo(() => {
    if (!catalog) return [];
    return applyFilters(allWords, { ...quizSetup, keyword: "", sort: "original" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, allWords, quizSetup.collection, quizSetup.category, quizSetup.status]);

  const startQuiz = useCallback(() => {
    if (!quizPool.length) return;
    const picked = shuffled(quizPool).slice(0, clamp(quizSetup.count, 5, 50));
    const items = picked.map((w) => {
      const mode = ["cn-en", "en-cn", "blank"][Math.floor(Math.random() * 3)];
      if (mode === "blank") return { wordId: w.id, mode };
      const distractors = shuffled(quizPool.filter((x) => x.id !== w.id)).slice(0, 3);
      const choices = shuffled([w, ...distractors]);
      const options = choices.map((x) => ({
        text: mode === "cn-en" ? x.word : x.meaning,
        correct: x.id === w.id,
      }));
      return { wordId: w.id, mode, options };
    });
    setQuiz({ items, index: 0, records: items.map(() => null), correct: 0, wrong: 0, done: false, answered: false, selected: null, revealed: false });
    navigate("quiz");
  }, [quizPool, quizSetup.count, navigate]);

  const quizWord = quiz && !quiz.done ? allWords.find((w) => w.id === quiz.items[quiz.index]?.wordId) : null;

  const answerQuiz = useCallback(
    (ok, selectedIdx = null) => {
      if (!quiz || quiz.answered || quiz.done) return;
      const records = [...quiz.records];
      records[quiz.index] = { answered: true, ok, selected: selectedIdx };
      setQuiz((q) => ({ ...q, records, answered: true, selected: selectedIdx, revealed: true, correct: q.correct + (ok ? 1 : 0), wrong: q.wrong + (ok ? 0 : 1) }));
      markStudy(quiz.items[quiz.index].wordId);
      scheduleReview(quiz.items[quiz.index].wordId, ok);
    },
    [quiz, markStudy, scheduleReview],
  );

  const submitBlank = useCallback(() => {
    const input = document.getElementById("blankAnswer");
    if (!input || !quizWord) return;
    answerQuiz(input.value.trim().toLowerCase() === quizWord.word.toLowerCase());
  }, [quizWord, answerQuiz]);

  const stepQuiz = useCallback(
    (target, direction, offset = 0) => {
      if (!quiz || quiz.done || quizBusy || target === quiz.index) return;
      switchCard(
        () => quizCardRef.current,
        () =>
          setQuiz((q) => {
            const rec = q.records[target];
            return { ...q, index: target, answered: !!rec?.answered, selected: rec?.selected ?? null, revealed: !!rec?.answered };
          }),
        direction,
        () => page === "quiz",
        offset,
      ).then(() => setQuizBusy(false));
      setQuizBusy(true);
    },
    [quiz, quizBusy, page],
  );
  const moveQuiz = useCallback(
    (step, offset = 0) => {
      if (!quiz) return;
      stepQuiz(clamp(quiz.index + step, 0, quiz.items.length - 1), step, offset);
    },
    [quiz, stepQuiz],
  );
  const nextQuestion = useCallback(
    (offset = 0) => {
      if (!quiz) return;
      if (quiz.index >= quiz.items.length - 1) setQuiz((q) => ({ ...q, done: true }));
      else stepQuiz(quiz.index + 1, 1, offset);
    },
    [quiz, stepQuiz],
  );
  moveQuizRef.current = moveQuiz;
  nextQuestionRef.current = nextQuestion;

  /* ---- 番茄钟 ---- */
  const pomo = user.pomodoro;
  const pomoRemaining = pomo.running && pomo.endsAt ? Math.max(0, Math.ceil((pomo.endsAt - Date.now()) / 1000)) : pomo.remaining;
  const setPomodoro = useCallback(
    (patch) => patchUser((prev) => ({ ...prev, pomodoro: { ...prev.pomodoro, ...patch } })),
    [patchUser],
  );
  const togglePomodoro = useCallback(() => {
    const p = user.pomodoro;
    if (p.running) setPomodoro({ running: false, remaining: pomoRemaining, endsAt: null });
    else setPomodoro({ running: true, endsAt: Date.now() + (pomoRemaining || p.duration * 60) * 1000 });
  }, [user.pomodoro, pomoRemaining, setPomodoro]);
  const finishPomodoro = useCallback(() => {
    const p = user.pomodoro;
    if (p.mode === "focus") setPomodoro({ mode: "break", duration: 5, remaining: 300, running: false, endsAt: null });
    else setPomodoro({ mode: "focus", remaining: p.duration * 60, running: false, endsAt: null });
  }, [user.pomodoro, setPomodoro]);
  useEffect(() => {
    if (pomo.running && pomoRemaining <= 0) finishPomodoro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.running, pomoRemaining]);
  const setPomodoroDuration = useCallback(
    (minutes) => {
      const m = clamp(Math.round(minutes), 5, 90);
      setPomodoro({ duration: m, remaining: m * 60, running: false, endsAt: null });
    },
    [setPomodoro],
  );
  const pomoDialRef = useRef(null);
  const dialDrag = useRef(null);
  const onDialPointer = useCallback(
    (e) => {
      if (pomo.running || !pomoDialRef.current) return;
      if (e.type === "pointerdown") {
        pomoDialRef.current.setPointerCapture(e.pointerId);
        dialDrag.current = true;
      } else if (!dialDrag.current) return;
      const rect = pomoDialRef.current.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const clockwise = (angle + 450) % 360;
      setPomodoroDuration(5 + (clockwise / 360) * 85);
      if (e.type === "pointerup" || e.type === "pointercancel") dialDrag.current = false;
    },
    [pomo.running, setPomodoroDuration],
  );

  /* ---- 测验自定义瞄准光标 ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches || !window.gsap) return;
    const cursor = quizCursorRef.current;
    const corners = cursor ? Array.from(cursor.querySelectorAll("i")) : [];
    const dot = cursor?.querySelector("b");
    if (!cursor || corners.length !== 4 || !dot) return;
    const rest = [
      { x: -18, y: -18 },
      { x: 6, y: -18 },
      { x: 6, y: 6 },
      { x: -18, y: 6 },
    ];
    let target = null;
    let frame = null;
    let spin = null;
    let px = 0;
    let py = 0;
    const moveX = gsap.quickTo(cursor, "x", { duration: 0.1, ease: "power3.out" });
    const moveY = gsap.quickTo(cursor, "y", { duration: 0.1, ease: "power3.out" });
    const cornerMoves = corners.map((c) => ({
      x: gsap.quickTo(c, "x", { duration: 0.2, ease: "power2.out" }),
      y: gsap.quickTo(c, "y", { duration: 0.2, ease: "power2.out" }),
    }));
    const available = () =>
      document.body.dataset.page === "quiz" &&
      user.quizCursor !== false &&
      !document.body.classList.contains("no-motion") &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startSpin = () => {
      if (!spin) spin = gsap.to(cursor, { rotation: 360, duration: 2, ease: "none", repeat: -1 });
      else spin.restart();
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!available()) return;
        if (target?.isConnected) {
          const r = target.getBoundingClientRect();
          const size = 12;
          const b = 4;
          const positions = [
            { x: r.left - b - px, y: r.top - b - py },
            { x: r.right + b - size - px, y: r.top - b - py },
            { x: r.right + b - size - px, y: r.bottom + b - size - py },
            { x: r.left - b - px, y: r.bottom + b - size - py },
          ];
          cornerMoves.forEach((m, i) => {
            m.x(positions[i].x);
            m.y(positions[i].y);
          });
          cursor.classList.add("is-active");
          document.body.classList.add("quiz-target-active");
        }
        moveX(px);
        moveY(py);
      });
    };
    const release = () => {
      target = null;
      document.body.classList.remove("quiz-target-active");
      gsap.to(corners, { borderColor: "#8f5867", duration: 0.15, overwrite: "auto" });
      gsap.to(dot, { backgroundColor: "#8f5867", scale: 1, duration: 0.18, overwrite: true });
      cornerMoves.forEach((m, i) => {
        m.x(rest[i].x);
        m.y(rest[i].y);
      });
      if (available()) startSpin();
      else spin?.pause();
    };
    const onOver = (e) => {
      if (!available()) return;
      const t = e.target.closest?.("button,a,input,select,[role='button']");
      if (!t || t === target) return;
      target = t;
      px = e.clientX;
      py = e.clientY;
      cursor.classList.add("is-active");
      document.body.classList.add("quiz-target-active");
      spin?.pause();
      gsap.to(cursor, { rotation: 0, duration: 0.16, ease: "power2.out", overwrite: "auto" });
      gsap.to(corners, { borderColor: "#b56f82", duration: 0.15, overwrite: "auto" });
      gsap.to(dot, { backgroundColor: "#b56f82", duration: 0.15, overwrite: "auto" });
      schedule();
    };
    const onMove = (e) => {
      if (!available()) return;
      if (!document.body.classList.contains("quiz-custom-cursor")) document.body.classList.add("quiz-custom-cursor");
      cursor.classList.add("is-active");
      px = e.clientX;
      py = e.clientY;
      schedule();
    };
    const onOut = (e) => {
      if (!target) return;
      const next = e.relatedTarget?.closest?.("button,a,input,select,[role='button']");
      if (next === target) return;
      if (next && available()) {
        target = next;
        px = e.clientX;
        py = e.clientY;
        schedule();
        return;
      }
      release();
    };
    const onDown = () => available() && (gsap.to(dot, { scale: 0.65, duration: 0.16, overwrite: "auto" }), gsap.to(cursor, { scale: 0.9, duration: 0.16, overwrite: "auto" }));
    const onUp = () => available() && (gsap.to(dot, { scale: 1, duration: 0.22, overwrite: "auto" }), gsap.to(cursor, { scale: 1, duration: 0.22, overwrite: "auto" }));
    const sync = () => {
      const on = available();
      document.body.classList.toggle("quiz-custom-cursor", on);
      if (!on) {
        cursor.classList.remove("is-active");
        document.body.classList.remove("quiz-target-active");
        spin?.pause();
      } else if (!target) startSpin();
    };
    sync();
    const syncTimer = setInterval(sync, 400);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("scroll", () => target && schedule(), { passive: true });
    return () => {
      clearInterval(syncTimer);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      frame !== null && cancelAnimationFrame(frame);
      spin?.kill();
      document.body.classList.remove("quiz-custom-cursor", "quiz-target-active");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.quizCursor, motionEnabled]);

  /* ---- 重置 ---- */
  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser({ ...defaultUserData(), quizCursor: user.quizCursor });
    setQuiz(null);
    setFlash((f) => ({ ...f, index: 0, flipped: false }));
    setModalOpen(false);
  }, [user.quizCursor]);

  /* ---- 学习最新词集 / 随机 / 继续 ---- */
  const latestCollection = useMemo(
    () => (catalog ? [...catalog.collections].filter((c) => c.wordCount > 0).sort((a, b) => b.sortOrder - a.sortOrder)[0] : null),
    [catalog],
  );
  const startLatest = useCallback(() => {
    if (!latestCollection) return;
    patchUser((prev) => ({ ...prev, studyCollectionId: latestCollection.id }));
    navigate("study");
  }, [latestCollection, patchUser, navigate]);
  const startRandom = useCallback(() => {
    if (!catalog || !allWords.length) return;
    const picked = shuffled(allWords).slice(0, 40);
    patchUser((prev) => ({ ...prev, studyCollectionId: "all", lastWordId: picked[0]?.id ?? prev.lastWordId }));
    navigate("study");
  }, [catalog, allWords, patchUser, navigate]);
  const continueStudy = useCallback(() => {
    patchUser((prev) => ({ ...prev, studyCollectionId: "all" }));
    navigate("study");
  }, [patchUser, navigate]);

  const app = {
    catalog,
    user,
    allWords,
    categories,
    stats,
    navigate,
    patchUser,
    setWordState,
    updateWordStatus,
    toggleFavorite,
    markStudy,
    lib,
    setLib,
    flash,
    setFlash,
    quizSetup,
    setQuizSetup,
    quiz,
    setQuiz,
    quizPool,
    startQuiz,
    answerQuiz,
    submitBlank,
    clock,
    pomo,
    pomoRemaining,
    togglePomodoro,
    setPomodoroDuration,
    onDialPointer,
    pomoDialRef,
    latestCollection,
    startLatest,
    startRandom,
    continueStudy,
  };

  /* 触摸：左右滑动切换页面（卡片区域内部的滑动不抢占） */
  const [pageDeckEl, setPageDeckEl] = useState(null);
  useSwipeDeck(pageDeckEl, {
    role: "page",
    getDragEl: () => pageDeckEl?.querySelector(".page.active"),
    ignoreSelector: ".swipe-deck, input, textarea, select",
    ignoreZone: () => pageDeckEl?.querySelector(".page.active .swipe-deck"),
    threshold: 72,
    onSwipe: (step) => {
      const ids = PAGES.map(([id]) => id);
      const at = ids.indexOf(page);
      if (at < 0) return;
      const next = ids[(at + step + ids.length) % ids.length];
      if (next !== page) navigate(next);
    },
  });

  const navButtons = (variant) =>
    PAGES.map(([id, label, icon]) => (
      <button key={id} className={page === id ? "active" : ""} data-page={id} aria-label={`前往${label}`} onClick={() => navigate(id)}>
        {variant === "top" ? (
          <span className="nav-label-stack">
            <i className="nav-hover-circle" aria-hidden="true" />
            <span className="nav-label-copy">
              <span className="nav-icon">{icon}</span>
              <em>{label}</em>
            </span>
            <span className="nav-label-copy nav-label-hover" aria-hidden="true">
              <span className="nav-icon">{icon}</span>
              <em>{label}</em>
            </span>
          </span>
        ) : (
          <>
            <span>{icon}</span>
            {label}
          </>
        )}
      </button>
    ));

  const renderPage = () => {
    if (!catalog) {
      return page === "home" ? <BootHome clock={clock} bootError={bootError} /> : null;
    }
    switch (page) {
      case "home":
        return <HomePage app={app} />;
      case "library":
        return <LibraryPage app={app} />;
      case "study":
        return <StudyPage app={app} studyCardRef={studyCardRef} moveRef={moveStudyRef} />;
      case "flash":
        return <FlashPage app={app} flashSceneRef={flashSceneRef} flashWord={flashWord} flashPool={flashPool} moveRef={moveFlashRef} />;
      case "quiz":
        return <QuizPage app={app} quizWord={quizWord} quizCardRef={quizCardRef} moveQuiz={moveQuiz} nextQuestion={nextQuestion} />;
      case "favorites":
        return <FavoritesPage app={app} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="garden-background-art" aria-hidden="true" />
      <div className="glow g1" aria-hidden="true" />
      <div className="glow g2" aria-hidden="true" />
      <div className="sakura-branch" aria-hidden="true" />
      <div className="petal-field petal-field--back" ref={petals.backRef} aria-hidden="true" />
      <div className="app-shell">
        <div className="petal-field petal-field--mid" ref={petals.midRef} aria-hidden="true" />
        <div className="petal-field petal-field--front" ref={petals.frontRef} aria-hidden="true" />
        <header className="topbar glass">
          <div className="brand">
            词间日和<small>WORDS IN BLOOM</small>
          </div>
          <nav className="nav" id="topNav">
            {navButtons("top")}
          </nav>
          <div className="tools">
            <button
              className="theme-btn"
              onClick={() => {
                const root = document.documentElement;
                const next = root.dataset.theme === "dark" ? "light" : "dark";
                root.dataset.theme = next;
                try {
                  localStorage.setItem("wordsInBloomTheme", next);
                } catch {
                  /* 隐私模式下忽略 */
                }
              }}
              aria-label="切换明暗主题"
              title="切换明暗主题"
            >
              <span className="theme-icon theme-icon-light" aria-hidden="true">
                ☀
              </span>
              <span className="theme-icon theme-icon-dark" aria-hidden="true">
                ☾
              </span>
            </button>
            <a
              className="gh-btn"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="打开 GitHub 仓库"
              title="GitHub 仓库"
            >
              <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </a>
            <button className="icon-btn" onClick={() => setModalOpen(true)} aria-label="重置全部进度">
              重置
            </button>
          </div>
        </header>
        <main className="main swipe-deck" ref={setPageDeckEl}>
          {PAGES.map(([id]) => (
            <section
              key={id}
              id={id}
              ref={(el) => {
                sectionRefs.current[id] = el;
              }}
              className={`page ${page === id ? "active" : ""}`}
            >
              {page === id ? renderPage() : null}
            </section>
          ))}
        </main>
        <div className="app-status-row">
          <div className="sync-status" data-state={catalog ? (bootError ? "error" : "connected") : "connecting"} role="status">
            {bootError ? "词库加载失败 · 请刷新重试" : catalog ? "静态版已就绪 · 进度保存在此浏览器" : "正在整理今天的学习书桌…"}
          </div>
        </div>
        <div className="footer-whisper">A word revisited becomes a word remembered.</div>
      </div>
      <nav className="bottom-nav glass" id="bottomNav">
        {navButtons("bottom")}
      </nav>
      {page !== "home" && (pomo.running || pomoRemaining < pomo.duration * 60) && (
        <button className="pomodoro-mini glass" onClick={() => navigate("home")} aria-label="返回首页查看番茄钟">
          <span aria-hidden="true">◷</span>
          <span>
            <b>{formatPomodoro(pomoRemaining)}</b>
            <br />
            <small>{pomo.mode === "focus" ? "专注" : "休息"} · {pomo.running ? "进行中" : "已暂停"}</small>
          </span>
        </button>
      )}
      <button className={`to-top ${showTop ? "show" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="返回顶部">
        ↑
      </button>
      <div className="quiz-target-cursor" ref={quizCursorRef} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div className={`modal ${modalOpen ? "show" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modalTitle" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
        <div className="dialog glass">
          <h3 id="modalTitle">重置学习记录？</h3>
          <p>这会清除学习状态、收藏、连续天数和测试成绩，且无法撤销。</p>
          <div className="actions">
            <button className="pill" onClick={() => setModalOpen(false)}>
              取消
            </button>
            <button className="pill danger" onClick={resetAll}>
              确认重置
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const formatPomodoro = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/* ---------- 启动骨架屏 ---------- */
function BootHome({ clock, bootError }) {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">WORDS IN BLOOM</div>
        <h1>词间日和</h1>
        <div className="jp">ことばの記憶</div>
        <p className="subtitle">Let the words you learn today settle, slowly, into memory.</p>
        <span className="date">
          <span>{clock.date}</span>
          <time className="beijing-time">{clock.time}</time>
        </span>
      </div>
      <div className="dashboard glass" aria-busy="true" aria-label="正在载入学习数据">
        <div className="home-boot-ring" aria-hidden="true" />
        <div className="stats">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="stat home-boot-stat" key={i}>
              <i className="home-boot-line" />
              <i className="home-boot-line short" />
            </div>
          ))}
        </div>
      </div>
      <div className="home-boot-actions" aria-hidden="true">
        <i className="home-boot-action" />
        <i className="home-boot-action" />
        <i className="home-boot-action" />
      </div>
      <p className="home-boot-copy" style={{ marginTop: 18 }}>
        {bootError ? `词库加载失败：${bootError}` : "正在整理今天的学习书桌…"}
      </p>
      <div className="home-showcase">
        <div className="home-grid">
          <div className="journal-card glass" aria-hidden="true">
            <i className="home-boot-line" style={{ width: "55%" }} />
            <i className="home-boot-line short" style={{ width: "80%" }} />
          </div>
          <div className="journal-card glass" aria-hidden="true">
            <i className="home-boot-line" style={{ width: "40%" }} />
            <i className="home-boot-line short" style={{ width: "70%" }} />
          </div>
          <div className="journal-card glass" aria-hidden="true">
            <i className="home-boot-line" style={{ width: "60%" }} />
            <i className="home-boot-line short" style={{ width: "75%" }} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 首页 ---------- */
function HomePage({ app }) {
  const { stats, navigate, clock, setLib, pomo, pomoRemaining, togglePomodoro, setPomodoroDuration, onDialPointer, pomoDialRef, latestCollection, startLatest, startRandom, continueStudy } = app;
  const ringR = 64;
  const ringC = 2 * Math.PI * ringR;
  const dialR = 56;
  const dialC = 2 * Math.PI * dialR;
  const dialRatio = pomo.running ? pomoRemaining / (pomo.duration * 60) : pomo.duration / 90;
  const sections = ["基础词", "进阶词", "高分词"];
  const sectionProgress = sections.map((section) => {
    const list = app.allWords.filter((w) => w.section === section);
    const learned = list.filter((w) => w.status !== "new").length;
    return { section, total: list.length, learned, pct: list.length ? Math.round((learned / list.length) * 100) : 0 };
  });
  const goLibrary = (status) => {
    setLib((f) => ({ ...f, status, page: 0 }));
    navigate("library");
  };
  return (
    <>
      <div className="hero">
        <div className="eyebrow">WORDS IN BLOOM</div>
        <h1>词间日和</h1>
        <div className="jp">ことばの記憶</div>
        <p className="subtitle">Let the words you learn today settle, slowly, into memory.</p>
        <span className="date">
          <span>{clock.date}</span>
          <time className="beijing-time">{clock.time}</time>
        </span>
      </div>
      <div className="dashboard glass">
        <div className="ring-wrap" role="img" aria-label={`全部词库进度 ${stats.percent}%`}>
          <svg viewBox="0 0 148 148" width="148" height="148">
            <circle cx="74" cy="74" r={ringR} fill="none" stroke="rgba(181,111,130,0.16)" strokeWidth="9" />
            <circle
              cx="74"
              cy="74"
              r={ringR}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={ringC}
              strokeDashoffset={ringC * (1 - stats.percent / 100)}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ddc8cd" />
                <stop offset="100%" stopColor="#b56f82" />
              </linearGradient>
            </defs>
          </svg>
          <b>{stats.percent}%</b>
          <small>全部词库进度</small>
        </div>
        <div className="stats">
          <div className="stat">
            <CountUp value={stats.total} />
            <span>累计单词</span>
          </div>
          <div className="stat">
            <CountUp value={stats.collections} />
            <span>累计词集</span>
          </div>
          <button className="stat" onClick={() => goLibrary("mastered")}>
            <CountUp value={stats.mastered} />
            <span>已掌握</span>
          </button>
          <button className="stat" onClick={() => goLibrary("learning")}>
            <CountUp value={stats.learning} />
            <span>学习中</span>
          </button>
          <button className="stat" onClick={() => goLibrary("review")}>
            <CountUp value={stats.due} />
            <span>待复习</span>
          </button>
          <div className="stat">
            <CountUp value={stats.streak} suffix=" 天" />
            <span>连续学习</span>
          </div>
        </div>
      </div>
      <div className="home-actions">
        <button className="pill primary" onClick={startLatest}>
          学习最新词集
        </button>
        <button className="pill" onClick={startRandom}>
          跨词集随机学习
        </button>
        <button className="pill" onClick={continueStudy}>
          继续上次进度
        </button>
      </div>
      <p className="home-hint">
        累计进度 {stats.percent}% · 收藏 {stats.favorites} 个单词
      </p>
      <p className="swipe-hint page-swipe-hint">← 左右滑动可切换页面</p>
      <div className="home-grid">
        <div className="journal-card glass pomodoro-card">
          <div className="kicker">Pomodoro</div>
          <h3>专注时光</h3>
          <div className="dial-row">
            <div
              className={`pomodoro-dial ${pomo.running ? "running" : ""}`}
              ref={pomoDialRef}
              onPointerDown={onDialPointer}
              onPointerMove={onDialPointer}
              onPointerUp={onDialPointer}
              onPointerCancel={onDialPointer}
              role="slider"
              aria-label="番茄钟时长"
              aria-valuemin={5}
              aria-valuemax={90}
              aria-valuenow={pomo.duration}
            >
              <svg viewBox="0 0 132 132" width="132" height="132">
                <circle cx="66" cy="66" r={dialR} fill="none" stroke="rgba(181,111,130,0.14)" strokeWidth="7" />
                <circle
                  cx="66"
                  cy="66"
                  r={dialR}
                  fill="none"
                  stroke={pomo.mode === "break" ? "#9caf94" : "#b56f82"}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={dialC}
                  strokeDashoffset={dialC * (1 - clamp(dialRatio, 0, 1))}
                  style={{ transition: "stroke-dashoffset 0.2s ease" }}
                />
              </svg>
              <span className="dial-time">{formatPomodoro(pomoRemaining)}</span>
            </div>
            <div className="pomodoro-side">
              <span className="pomodoro-phase">
                {pomo.mode === "focus" ? "专注" : "休息"} · {pomo.running ? "进行中" : "已暂停"}
              </span>
              <span className="pomodoro-phase">拖动表盘调时长（5–90 分钟）</span>
              <div className="card-actions">
                <button className="pill primary" onClick={togglePomodoro}>
                  {pomo.running ? "暂停" : "开始"}
                </button>
                <button className="pill" onClick={() => app.patchUser((prev) => ({ ...prev, pomodoro: { ...prev.pomodoro, remaining: prev.pomodoro.duration * 60, running: false, endsAt: null } }))}>
                  重置
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="journal-card glass">
          <div className="kicker">Group {String(app.catalog.collections.length).padStart(2, "0")} / {String(app.catalog.collections.length).padStart(2, "0")} · 最新词集</div>
          <h3 className="latest-title">{latestCollection?.title || "—"}</h3>
          <p className="muted">
            最新一期词集，共 {latestCollection?.wordCount || 0} 个单词。A word visited today returns tomorrow.
          </p>
          <div className="card-actions">
            <button className="pill primary" onClick={startLatest}>
              学习该词集
            </button>
            <button className="pill" onClick={() => { app.setLib((f) => ({ ...f, collection: latestCollection?.id || "all", page: 0 })); navigate("library"); }}>
              查看词表
            </button>
          </div>
        </div>
        <div className="journal-card glass">
          <div className="kicker">A Quiet Path</div>
          <h3>长期学习路径</h3>
          <div className="path-row">
            {sectionProgress.map((s) => (
              <div className="path-item" key={s.section}>
                <span>{s.section}</span>
                <div className="path-bar">
                  <i style={{ width: `${s.pct}%` }} />
                </div>
                <b>
                  {s.learned}/{s.total}
                </b>
              </div>
            ))}
          </div>
          <div className="card-actions">
            <button className="pill" onClick={() => { app.setLib((f) => ({ ...f, collection: "all", page: 0 })); navigate("library"); }}>
              打开词典库
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 词典库 ---------- */
function LibraryPage({ app }) {
  const { allWords, catalog, categories, lib, setLib, navigate, toggleFavorite } = app;
  const filtered = useMemo(() => applyFilters(allWords, lib), [allWords, lib]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = clamp(lib.page, 0, pageCount - 1);
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const setPage = (patch) => setLib((f) => ({ ...f, ...patch }));
  const searchRef = useRef(null);
  const onSearch = (e) => {
    if (e.nativeEvent.isComposing) return;
    setPage({ keyword: e.target.value, page: 0 });
  };
  return (
    <>
      <div className="section-head">
        <div>
          <h2>词典库</h2>
          <p>Every word, in season.</p>
        </div>
      </div>
      <div className="filters glass">
        <input ref={searchRef} className="field search" placeholder="搜索单词或释义…" defaultValue={lib.keyword} onChange={onSearch} aria-label="搜索单词" />
        <select className="field" value={lib.collection} onChange={(e) => setPage({ collection: e.target.value, page: 0 })} aria-label="按词集筛选">
          <option value="all">全部词集</option>
          {catalog.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（{c.wordCount}）
            </option>
          ))}
        </select>
        <select className="field" value={lib.category} onChange={(e) => setPage({ category: e.target.value, page: 0 })} aria-label="按词性筛选">
          <option value="all">全部词性</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="field" value={lib.status} onChange={(e) => setPage({ status: e.target.value, page: 0 })} aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option value="new">未学</option>
          <option value="learning">学习中</option>
          <option value="review">待复习</option>
          <option value="mastered">已掌握</option>
          <option value="favorite">已收藏</option>
        </select>
        <select className="field" value={lib.sort} onChange={(e) => setPage({ sort: e.target.value, seed: Date.now() >>> 0, page: 0 })} aria-label="排序">
          <option value="original">录入顺序</option>
          <option value="alpha">字母顺序</option>
          <option value="random">随机顺序</option>
          <option value="review">待复习优先</option>
          <option value="favorite">收藏优先</option>
        </select>
        <button
          className="pill"
          onClick={() => {
            setLib((f) => ({ ...f, collection: "all", category: "all", status: "all", sort: "original", keyword: "", page: 0, seed: 1 }));
            if (searchRef.current) searchRef.current.value = "";
          }}
        >
          清除筛选
        </button>
        <button className="pill" onClick={() => setPage({ sort: "random", seed: Date.now() >>> 0, page: 0 })}>
          从当前结果随机学习
        </button>
      </div>
      <div className="content-tools">
        <p className="count">
          共 {catalog.collections.length} 组词集 · 筛选到 {filtered.length} 个单词
          {filtered.length ? ` · 第 ${current + 1}/${pageCount} 页 · 本页 ${slice.length} 个` : ""}
        </p>
      </div>
      {slice.length ? (
        <>
          <div className="grid">
            {slice.map((w) => (
              <article key={w.id} className="word-card glass" onClick={() => { app.patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: "all" })); navigate("study"); }}>
                <header>
                  <h3>{w.word}</h3>
                  <button className={`fav-btn ${w.favorite ? "active" : ""}`} onClick={(e) => (e.stopPropagation(), toggleFavorite(w.id))} aria-label="收藏">
                    {w.favorite ? "♥" : "♡"}
                  </button>
                </header>
                {w.phonetic ? <p className="phonetic">{phoneticOf(w)}</p> : null}
                <p className="meaning">{w.meaning}</p>
                <div className="badges">
                  <span className="badge">{w.category}</span>
                  <span className="badge collection">{w.collectionTitle}</span>
                  <span className="badge num">#{w.number}</span>
                  <span className={`badge s-${w.status}`}>{STATUS_LABEL[w.status]}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            {Array.from({ length: pageCount }, (_, i) => i)
              .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - current) <= 2)
              .map((i, idx, arr) => (
                <span key={i} style={{ display: "contents" }}>
                  {idx > 0 && arr[idx - 1] !== i - 1 && <span className="count">…</span>}
                  <button className={i === current ? "current" : ""} onClick={() => setPage({ page: i })}>
                    {i + 1}
                  </button>
                </span>
              ))}
          </div>
        </>
      ) : (
        <div className="empty glass">
          No words found here yet.
          <br />
          Try another collection or a different phrase.
        </div>
      )}
    </>
  );
}

/* ---------- 沉浸学习 ---------- */
function StudyPage({ app, studyCardRef, moveRef }) {
  const { user, allWords, catalog, patchUser, updateWordStatus, toggleFavorite, navigate } = app;
  const pool = useMemo(
    () => allWords.filter((w) => user.studyCollectionId === "all" || w.collectionId === user.studyCollectionId),
    [allWords, user.studyCollectionId],
  );
  const idx = Math.max(0, pool.findIndex((w) => w.id === user.lastWordId));
  const word = pool[clamp(idx, 0, Math.max(0, pool.length - 1))];
  useEffect(() => {
    if (word) app.markStudy(word.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id]);

  /* 与记忆卡片共用同一套滑动 / 切换引擎 */
  const { move, setDeckEl } = useCardDeck({
    containerRef: studyCardRef,
    cardSelector: ".study-card",
    pool,
    index: idx,
    activePage: () => document.body.dataset.page === "study",
    commit: (next) => patchUser((prev) => ({ ...prev, lastWordId: pool[next].id })),
    moveRef,
  });
  if (!pool.length) {
    return (
      <>
        <div className="section-head">
          <div>
            <h2>沉浸学习</h2>
            <p>Slow reading, one word at a time.</p>
          </div>
        </div>
        <div className="empty glass">该词集暂无可学单词，换一个词集试试。</div>
      </>
    );
  }
  return (
    <>
      <div className="section-head study-head">
        <div>
          <h2>沉浸学习</h2>
          <p>
            {idx + 1} / {pool.length} · {word?.collectionTitle}
          </p>
        </div>
        <select className="field" value={user.studyCollectionId} onChange={(e) => patchUser((prev) => ({ ...prev, studyCollectionId: e.target.value, lastWordId: null }))} aria-label="选择词集">
          <option value="all">全部词集</option>
          {catalog.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（{c.wordCount}）
            </option>
          ))}
        </select>
      </div>
      <div className="study-stage swipe-deck" ref={(el) => { studyCardRef.current = el; setDeckEl(el); }}>
        <button className="round-btn" onClick={() => move(-1)} aria-label="上一个">
          ←
        </button>
        {word && (
          <div className="study-card glass swipe-target" key={word.id}>
            <div className="badges">
              <span className="badge">{word.category}</span>
              <span className="badge num">#{word.number}</span>
            </div>
            <h2 className="study-word">{word.word}</h2>
            {word.phonetic ? <p className="phonetic">{phoneticOf(word)}</p> : null}
            <p className="study-meaning">{word.meaning}</p>
            <div className="study-actions">
              <button className={`pill ${word.status === "learning" ? "on" : ""}`} onClick={() => updateWordStatus(word.id, "learning")}>
                学习中
              </button>
              <button className={`pill ${word.status === "review" ? "on" : ""}`} onClick={() => updateWordStatus(word.id, "review")}>
                待复习
              </button>
              <button className={`pill ${word.status === "mastered" ? "on" : ""}`} onClick={() => updateWordStatus(word.id, "mastered")}>
                已掌握
              </button>
              <button className={`pill ${word.favorite ? "on" : ""}`} onClick={() => toggleFavorite(word.id)}>
                {word.favorite ? "♥ 已收藏" : "♡ 收藏"}
              </button>
              <button className="pill" onClick={() => { app.setLib((f) => ({ ...f, collection: word.collectionId, keyword: word.word, page: 0 })); navigate("library"); }}>
                在词库中查看
              </button>
            </div>
            <p className="study-hint">← → 切换单词 · M 掌握 · R 复习 · F 收藏</p>
          </div>
        )}
        <button className="round-btn" onClick={() => move(1)} aria-label="下一个">
          →
        </button>
      </div>
      <p className="swipe-hint">← 左右滑动切换单词 · 上滑不翻页</p>
    </>
  );
}

/* ---------- 记忆卡片 ---------- */
function FlashPage({ app, flashSceneRef, flashWord, flashPool, moveRef }) {
  const { flash, setFlash, catalog, allWords, toggleFavorite, navigate } = app;
  const setF = (patch) => setFlash((f) => ({ ...f, ...patch }));

  /* 与沉浸学习共用同一套滑动 / 切换引擎：手势判定、阻尼、阈值、出入场时序完全一致 */
  const { move, setDeckEl } = useCardDeck({
    containerRef: flashSceneRef,
    cardSelector: ".flip-card",
    pool: flashPool,
    index: flash.index,
    activePage: () => document.body.dataset.page === "flash",
    commit: (next) => setFlash((f) => ({ ...f, index: next, flipped: false })),
    moveRef,
  });
  return (
    <>
      <div className="section-head">
        <div>
          <h2>记忆卡片</h2>
          <p>Flip, recall, let it settle.</p>
        </div>
        <p className="count">
          {flashPool.length ? flash.index + 1 : 0} / {flashPool.length}
        </p>
      </div>
      <div className="filters glass">
        <select className="field" value={flash.collection} onChange={(e) => setF({ collection: e.target.value, index: 0, flipped: false })} aria-label="按词集筛选">
          <option value="all">全部词集</option>
          {catalog.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（{c.wordCount}）
            </option>
          ))}
        </select>
        <select className="field" value={flash.status} onChange={(e) => setF({ status: e.target.value, index: 0, flipped: false })} aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option value="new">未学</option>
          <option value="learning">学习中</option>
          <option value="review">待复习</option>
          <option value="mastered">已掌握</option>
          <option value="favorite">已收藏</option>
        </select>
        <select className="field" value={flash.sort} onChange={(e) => setF({ sort: e.target.value, seed: Date.now() >>> 0, index: 0, flipped: false })} aria-label="排序">
          <option value="original">录入顺序</option>
          <option value="alpha">字母顺序</option>
          <option value="random">随机顺序</option>
        </select>
      </div>
      {flashWord ? (
        <>
          {/* 与沉浸学习的 .study-stage 一致：卡片 + 导航按钮在同一个滑动手势区内，
              在卡片下方按钮区起手的横向滑动也切卡片，而不会落到页面级滑动把整页拖走 */}
          <div className="flash-stage swipe-deck" ref={(el) => { flashSceneRef.current = el; setDeckEl(el); }}>
            <div className="flip-scene">
              <div
                key={flash.index}
                className={`flip-card swipe-target ${flash.flipped ? "flipped" : ""}`}
                data-flip
                tabIndex={0}
                onClick={() => setF({ flipped: !flash.flipped })}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setF({ flipped: !flash.flipped }))}
                aria-label="翻转卡片"
              >
                <div className="face front glass">
                  <div className="badges">
                    <span className="badge">{flashWord.category}</span>
                    <span className="badge num">#{flashWord.number}</span>
                  </div>
                  <h2 className="flip-word">{flashWord.word}</h2>
                  {flashWord.phonetic ? <p className="phonetic">{phoneticOf(flashWord)}</p> : null}
                  <p className="flip-tip">点击或按空格翻面</p>
                </div>
                <div className="face back glass">
                  <span className="badge collection">{flashWord.collectionTitle}</span>
                  <h2 className="flip-word">{flashWord.word}</h2>
                  <p className="flip-meaning">{flashWord.meaning}</p>
                </div>
              </div>
            </div>
            <div className="flash-nav">
              <button className="round-btn" onClick={() => move(-1)} aria-label="上一张">
                ←
              </button>
              <button className={`pill ${flashWord.favorite ? "primary" : ""}`} onClick={() => toggleFavorite(flashWord.id)}>
                {flashWord.favorite ? "♥ 已收藏" : "♡ 收藏"}
              </button>
              <button className="pill" onClick={() => { app.patchUser((prev) => ({ ...prev, lastWordId: flashWord.id, studyCollectionId: "all" })); navigate("study"); }}>
                去沉浸学习
              </button>
              <button className="round-btn" onClick={() => move(1)} aria-label="下一张">
                →
              </button>
            </div>
          </div>
          <p className="swipe-hint">← 左右滑动切换卡片 · 点击翻面</p>
        </>
      ) : (
        <div className="empty glass">当前筛选下没有卡片，换一组条件试试。</div>
      )}
    </>
  );
}

/* ---------- 记忆测试 ---------- */
function QuizPage({ app, quizWord, quizCardRef, moveQuiz, nextQuestion }) {
  const { quiz, setQuiz, quizPool, quizSetup, setQuizSetup, startQuiz, answerQuiz, submitBlank, allWords, navigate, patchUser, setLib } = app;
  /* 触摸：左右滑动切换题目（输入框内不拦截） */
  const [deckEl, setDeckEl] = useState(null);
  useSwipeDeck(deckEl, {
    getDragEl: () => deckEl,
    ignoreSelector: "input, textarea",
    onSwipe: (step, offset) => (step > 0 ? nextQuestion(offset) : moveQuiz(-1, offset)),
  });
  if (!quiz) {
    return (
      <>
        <div className="section-head">
          <div>
            <h2>记忆测试</h2>
            <p>A gentle examination of memory.</p>
          </div>
        </div>
        <div className="quiz-setup glass">
          <h2>开始一组测试</h2>
          <div className="setup-grid">
            <select className="field" value={quizSetup.collection} onChange={(e) => setQuizSetup((s) => ({ ...s, collection: e.target.value }))} aria-label="按词集出题">
              <option value="all">全部词集</option>
              {app.catalog.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}（{c.wordCount}）
                </option>
              ))}
            </select>
            <select className="field" value={quizSetup.status} onChange={(e) => setQuizSetup((s) => ({ ...s, status: e.target.value }))} aria-label="按状态出题">
              <option value="all">全部状态</option>
              <option value="new">未学</option>
              <option value="learning">学习中</option>
              <option value="review">待复习</option>
              <option value="mastered">已掌握</option>
            </select>
            <select className="field" value={quizSetup.count} onChange={(e) => setQuizSetup((s) => ({ ...s, count: Number(e.target.value) }))} aria-label="题数">
              <option value={10}>10 题</option>
              <option value={20}>20 题</option>
              <option value={30}>30 题</option>
            </select>
          </div>
          <p className="hint">本组共 {quizPool.length} 个可选单词 · 中英互测与拼写混合出题 · 同一单词连续答对两次即标记「已掌握」，答错则清零并安排复习。</p>
          <div>
            <button className="pill primary" onClick={startQuiz} disabled={!quizPool.length}>
              开始测试
            </button>
          </div>
        </div>
      </>
    );
  }
  if (quiz.done) {
    const total = quiz.correct + quiz.wrong;
    const rate = total ? Math.round((quiz.correct / total) * 100) : 0;
    const wrongItems = quiz.records
      .map((r, i) => ({ r, w: allWords.find((x) => x.id === quiz.items[i]?.wordId) }))
      .filter(({ r, w }) => r?.answered && !r.ok && w);
    return (
      <div className="result-card glass">
        <p className="result-score">{rate}</p>
        <p className="count">
          答对 {quiz.correct} / {total} 题
        </p>
        {wrongItems.length ? (
          <ul className="error-list">
            {wrongItems.map(({ w }) => (
              <li key={w.id}>
                <b>{w.word}</b> — {w.meaning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="count">全对，这一组词已经稳稳落进记忆里。</p>
        )}
        <div className="result-actions">
          <button className="pill primary" onClick={startQuiz}>
            再测一组
          </button>
          <button className="pill" onClick={() => setQuiz(null)}>
            调整范围
          </button>
          <button className="pill" onClick={() => { setLib((f) => ({ ...f, collection: "all", page: 0 })); navigate("library"); }}>
            回词典库
          </button>
        </div>
      </div>
    );
  }
  const w = quizWord;
  const rec = quiz.records[quiz.index];
  const answered = !!rec?.answered;
  const mode = quiz.items[quiz.index].mode;
  const modeLabel = { "cn-en": "看释义选单词", "en-cn": "看单词选释义", blank: "拼写填空" }[mode];
  return (
    <>
      <div className="quiz-meta">
        <span>
          第 {quiz.index + 1} / {quiz.items.length} 题 · {modeLabel}
        </span>
        <span>
          正确 {quiz.correct} · 错误 {quiz.wrong}
        </span>
      </div>
      <div className="quiz-card glass swipe-deck swipe-target" ref={(el) => { quizCardRef.current = el; setDeckEl(el); }} key={quiz.index}>
        {mode === "blank" ? (
          <>
            <div className="prompt">{w?.meaning}</div>
            <div className="quiz-translation">写出对应的英文单词</div>
            <div className="blank-row">
              <input className="field" id="blankAnswer" placeholder="输入目标单词" autoComplete="off" disabled={answered} />
              <button className="pill primary" id="submitBlank" onClick={submitBlank} disabled={answered}>
                提交
              </button>
            </div>
            {answered && (
              <p className="quiz-translation">
                {rec.ok ? "正确：" : "正确答案："}
                <b>{w?.word}</b>
              </p>
            )}
          </>
        ) : (
          <>
            <div className="prompt">{mode === "cn-en" ? w?.meaning : w?.word}</div>
            <div className="quiz-translation">{mode === "cn-en" ? "选择正确的英文单词" : "选择正确的中文释义"}</div>
            <div className="options">
              {(quiz.items[quiz.index].options || []).map((o, i) => {
                let cls = "option";
                if (answered && o.correct) cls += " correct";
                else if (answered && rec?.selected === i) cls += " wrong";
                else if (answered) cls += " dim";
                return (
                  <button key={i} className={cls} disabled={answered} onClick={() => answerQuiz(o.correct, i)}>
                    {o.text}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="quiz-actions">
          <button className="pill" onClick={() => moveQuiz(-1)} disabled={quiz.index === 0}>
            ← 上一题
          </button>
          {w && (
            <button className="pill quiz-jump" onClick={() => { patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: "all" })); navigate("study"); }}>
              沉浸学习 {w.word}
            </button>
          )}
          <button className="pill primary" onClick={nextQuestion} disabled={!answered}>
            {quiz.index >= quiz.items.length - 1 ? "查看结果" : "下一题 →"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- 收藏夹 ---------- */
function FavoritesPage({ app }) {
  const { allWords, toggleFavorite, setLib, navigate } = app;
  const favs = allWords.filter((w) => w.favorite);
  return (
    <>
      <div className="section-head">
        <div>
          <h2>收藏夹</h2>
          <p>Keep the words worth returning to, close at hand.</p>
        </div>
      </div>
      {favs.length ? (
        <>
          <div className="content-tools">
            <p className="count">已收藏 {favs.length} 个单词</p>
          </div>
          <div className="grid">
            {favs.map((w) => (
              <article key={w.id} className="word-card glass" onClick={() => { app.patchUser((prev) => ({ ...prev, lastWordId: w.id, studyCollectionId: "all" })); navigate("study"); }}>
                <header>
                  <h3>{w.word}</h3>
                  <button className="fav-btn active" onClick={(e) => (e.stopPropagation(), toggleFavorite(w.id))} aria-label="取消收藏">
                    ♥
                  </button>
                </header>
                {w.phonetic ? <p className="phonetic">{phoneticOf(w)}</p> : null}
                <p className="meaning">{w.meaning}</p>
                <div className="badges">
                  <span className="badge">{w.category}</span>
                  <span className="badge collection">{w.collectionTitle}</span>
                  <span className="badge num">#{w.number}</span>
                  <span className={`badge s-${w.status}`}>{STATUS_LABEL[w.status]}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="empty glass">
          <div className="empty-glyph">♡</div>
          <p>
            Nothing has been saved yet.
            <br />
            When a word stays with you, keep it here.
          </p>
          <button className="pill primary" onClick={() => { setLib((f) => ({ ...f, collection: "all", page: 0 })); navigate("library"); }}>
            前往单词库
          </button>
        </div>
      )}
    </>
  );
}
