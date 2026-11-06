/* 进度存储回归验证：node scripts/check_migration.mjs
 * 覆盖 v2 → v3 迁移、序列化往返、按书分桶切换、重置与进度摘要。 */
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  USER_VERSION,
  LEGACY_BOOK_ID,
  loadLocalUser,
  serializeUser,
  switchBookState,
  resetUser,
  bookProgress,
  defaultUserData,
} from "../components/userStorage.mjs";

const mockStorage = (raw) => ({
  getItem: (key) => (key === STORAGE_KEY ? raw : null),
  setItem: () => {},
});

const v2 = {
  v: 2,
  words: {
    1: { status: "mastered", favorite: true, correctStreak: 2, reviewAt: null },
    42: { status: "learning", correctStreak: 0 },
    777: { status: "review", reviewAt: 1893456000000 },
  },
  dates: ["2026-11-04", "2026-11-05"],
  lastWordId: 42,
  studyCollectionId: "group-03",
  quizCursor: false,
  pomodoro: { duration: 30, remaining: 1800, running: false, mode: "focus", endsAt: null },
};

/* 1. 新用户：没有 activeBookId，首访应弹选书框 */
{
  const { user, migrated } = loadLocalUser(mockStorage(null));
  assert.equal(migrated, false);
  assert.equal(user.v, USER_VERSION);
  assert.equal(user.activeBookId, null, "新用户尚未选书");
  assert.deepEqual(user.words, {});
}

/* 2. v2 → v3：旧进度整体搬进 3500 书桶，一个状态都不能丢 */
{
  const { user, migrated } = loadLocalUser(mockStorage(JSON.stringify(v2)));
  assert.equal(migrated, true, "应识别为 v2 并迁移");
  assert.equal(user.v, USER_VERSION);
  assert.equal(user.activeBookId, LEGACY_BOOK_ID);
  assert.deepEqual(user.words, v2.words, "旧 words 全量保留在扁平视图");
  assert.deepEqual(user.books[LEGACY_BOOK_ID].words, v2.words, "旧 words 全量保留在书桶");
  assert.equal(user.lastWordId, 42);
  assert.equal(user.studyCollectionId, "group-03");
  assert.deepEqual(user.dates, v2.dates, "连续天数全局保留");
  assert.equal(user.quizCursor, false, "偏好全局保留");
  assert.equal(user.pomodoro.duration, 30, "番茄钟全局保留");
}

/* 3. 序列化往返：写入 → 读取，形状与内容一致 */
{
  const { user } = loadLocalUser(mockStorage(JSON.stringify(v2)));
  const stored = serializeUser(user);
  assert.equal(stored.v, USER_VERSION);
  assert.equal(stored.activeBookId, LEGACY_BOOK_ID);
  assert.ok(!("words" in stored) || stored.words === undefined, "存储层不应有扁平视图字段");
  const { user: again, migrated } = loadLocalUser(mockStorage(JSON.stringify(stored)));
  assert.equal(migrated, false);
  assert.deepEqual(again.words, v2.words);
  assert.equal(again.lastWordId, 42);
  assert.equal(again.studyCollectionId, "group-03");
}

/* 4. 切书：两本书进度完全隔离，切回后原进度恢复 */
{
  const { user } = loadLocalUser(mockStorage(JSON.stringify(v2)));
  const switched = switchBookState(user, "phrases-764");
  assert.equal(switched.activeBookId, "phrases-764");
  assert.deepEqual(switched.words, {}, "词组书应有独立空进度");
  assert.equal(switched.lastWordId, null);
  assert.equal(switched.studyCollectionId, "all");
  assert.deepEqual(switched.books[LEGACY_BOOK_ID].words, v2.words, "3500 书进度存档未丢");

  // 在词组书里学几个词条
  const withPhraseProgress = {
    ...switched,
    words: { 3: { status: "mastered" }, 9: { status: "learning" } },
    lastWordId: 9,
  };
  const back = switchBookState(withPhraseProgress, LEGACY_BOOK_ID);
  assert.deepEqual(back.words, v2.words, "切回 3500 书，进度原样恢复");
  assert.equal(back.lastWordId, 42);
  assert.deepEqual(back.books["phrases-764"].words, withPhraseProgress.words, "词组书进度也被存档");
  assert.equal(bookProgress(back, "phrases-764", 764).learned, 2, "词组书进度摘要正确");
  assert.equal(bookProgress(back, LEGACY_BOOK_ID, 3289).learned, 3, "当前书取实时视图");
}

/* 5. 重置：保留词书选择，清空所有书进度与连续天数 */
{
  const { user } = loadLocalUser(mockStorage(JSON.stringify(v2)));
  const reset = resetUser(user);
  assert.equal(reset.activeBookId, LEGACY_BOOK_ID, "重置不应迫使重新选书");
  assert.deepEqual(reset.words, {});
  assert.deepEqual(reset.dates, []);
  assert.deepEqual(reset.books, {});
  assert.equal(reset.quizCursor, false);
}

/* 6. 无法识别的旧版本：沿用原有重置策略 */
{
  const { user } = loadLocalUser(mockStorage(JSON.stringify({ v: 1, words: { 1: { status: "mastered" } } })));
  assert.deepEqual(user, defaultUserData());
}

console.log("✓ 迁移 / 分桶 / 序列化 / 重置 全部通过（6 组断言）");
