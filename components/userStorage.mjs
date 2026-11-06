/* ============================================================
 * 词书进度存储（纯逻辑，不依赖 React / DOM，便于脚本验证）
 *
 * 存储形状 v3：
 *   {
 *     v: 3,
 *     activeBookId: "words-3500" | null,
 *     books: { [bookId]: { words, lastWordId, studyCollectionId } },  // 每本书独立进度
 *     dates, quizCursor, pomodoro                                      // 全局共享
 *   }
 *
 * 内存里的 user 额外摊平出 words / lastWordId / studyCollectionId 作为「当前书视图」，
 * 让所有按旧形状读写的组件零改动；写入时 serializeUser 会把视图同步回对应书桶。
 * ============================================================ */

export const STORAGE_KEY = "wordsInBloomData";
export const USER_VERSION = 3;
export const LEGACY_BOOK_ID = "words-3500";

export const emptyBookState = () => ({
  words: {},
  lastWordId: null,
  studyCollectionId: "all",
});

export const defaultUserData = () => ({
  v: USER_VERSION,
  activeBookId: null, // null = 尚未选过词书，首访弹框
  books: {},
  // 当前书的扁平视图
  words: {},
  lastWordId: null,
  studyCollectionId: "all",
  // 全局共享
  dates: [],
  quizCursor: true,
  pomodoro: { duration: 25, remaining: 1500, running: false, mode: "focus", endsAt: null },
});

const viewOf = (bucket) => ({
  words: bucket?.words || {},
  lastWordId: bucket?.lastWordId ?? null,
  studyCollectionId: bucket?.studyCollectionId || "all",
});

const snapshotOf = (user) => ({
  words: user.words || {},
  lastWordId: user.lastWordId ?? null,
  studyCollectionId: user.studyCollectionId || "all",
});

/** v2（单本书、无 activeBookId）→ v3：旧进度整体挪进 3500 词书桶，不丢任何状态。 */
export function migrateV2(old) {
  const bucket = viewOf(old);
  return {
    ...defaultUserData(),
    v: USER_VERSION,
    activeBookId: LEGACY_BOOK_ID,
    books: { [LEGACY_BOOK_ID]: bucket },
    ...bucket,
    dates: Array.isArray(old.dates) ? old.dates : [],
    quizCursor: old.quizCursor !== false,
    pomodoro: { ...defaultUserData().pomodoro, ...(old.pomodoro || {}) },
  };
}

/** 把 v3 存储对象还原成内存 user（摊平当前书视图）。 */
export function hydrateV3(stored) {
  const base = defaultUserData();
  const books = stored.books && typeof stored.books === "object" ? stored.books : {};
  const bucket = stored.activeBookId ? books[stored.activeBookId] || emptyBookState() : emptyBookState();
  return {
    ...base,
    ...stored,
    books,
    ...viewOf(bucket),
    pomodoro: { ...base.pomodoro, ...(stored.pomodoro || {}) },
  };
}

/**
 * 读取本地进度。storage 可注入，便于用 Node 验证迁移。
 * 返回 { user, migrated }；migrated 为 true 表示本次发生了 v2 → v3 迁移。
 */
export function loadLocalUser(storage) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return { user: defaultUserData(), migrated: false };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { user: defaultUserData(), migrated: false };
    if (parsed.v === 2) return { user: migrateV2(parsed), migrated: true };
    if (parsed.v === USER_VERSION) return { user: hydrateV3(parsed), migrated: false };
    // 更旧或无法识别的版本：沿用原有重置策略，避免 id 错配
    return { user: defaultUserData(), migrated: false };
  } catch {
    return { user: defaultUserData(), migrated: false };
  }
}

/** 持久化：把当前书的扁平视图同步回 books[activeBookId]，其余书桶原样保留。 */
export function serializeUser(user) {
  const books = { ...(user.books || {}) };
  if (user.activeBookId) books[user.activeBookId] = snapshotOf(user);
  return {
    v: USER_VERSION,
    activeBookId: user.activeBookId || null,
    books,
    dates: user.dates || [],
    quizCursor: user.quizCursor !== false,
    pomodoro: user.pomodoro || defaultUserData().pomodoro,
  };
}

/** 取某本书的进度桶；当前书取实时视图，其它书取已存快照。 */
export function bucketOf(user, bookId) {
  if (!bookId) return emptyBookState();
  if (bookId === user.activeBookId) return snapshotOf(user);
  return user.books?.[bookId] || emptyBookState();
}

/** 切换词书：旧书进度存档 → 新书进度摊平；全局字段不动。 */
export function switchBookState(user, bookId) {
  if (!bookId || bookId === user.activeBookId) return user;
  const books = { ...(user.books || {}) };
  if (user.activeBookId) books[user.activeBookId] = snapshotOf(user);
  const next = books[bookId] || emptyBookState();
  books[bookId] = next;
  return {
    ...user,
    activeBookId: bookId,
    books,
    ...viewOf(next),
  };
}

/** 重置进度：保留词书选择与主题外的偏好，清空所有书的进度、连续天数。 */
export function resetUser(user) {
  return {
    ...defaultUserData(),
    activeBookId: user.activeBookId,
    quizCursor: user.quizCursor,
  };
}

/** 词书选择卡片用的进度摘要（已学 / 总数 / 百分比 / 收藏数）。 */
export function bookProgress(user, bookId, total) {
  const bucket = bucketOf(user, bookId);
  const states = Object.values(bucket.words || {});
  const learned = states.filter((s) => s?.status && s.status !== "new").length;
  const favorites = states.filter((s) => s?.favorite).length;
  const count = Number(total) || 0;
  return {
    learned,
    favorites,
    total: count,
    percent: count ? Math.min(100, Math.round((learned / count) * 100)) : 0,
  };
}
