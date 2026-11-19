# 会话交接

## 当前目标

- 目标：词间日和已上线（https://cheshiping.github.io/words-to-bachelor-s/），当前无进行中功能；新需求进来时先追加到 `feature_list.json`
- 当前状态：核心功能 + 多词书 + 记忆卡片一键掌握 + 第三本词书全部完成（feat-001 ~ feat-016 全 done）
- 分支 / 提交：`main`，feat-016（第三本词书）待提交；基线 `07b9b89`（docs 同步）

## 本次会话已完成

- [x] **feat-016：《你还在背单词吗》4449 词书接入**
  - PDF（223 页 / 4449 词，双栏对照）经 txt + structure 双路交叉校验：编号 1–4449 连续、两栏词-义一一对应 0 异常
  - 转出 `docs/2027专升本英语你还在背单词吗.md`：按页分节 3 列表格 + 附录 A 用字对照（137 个兼容字符）+ 附录 B 逐页原文备份
  - `scripts/build_books.py` 新增 `parse_words_4449()` → `public/data/books/words-4449.json`（4449 词 / 223 页 / 14 类词性派生分类）
  - 词书清单加第三条：`hasSections=false`、`spellingEnabled=true`、pink 徽章、order=3；前端零改动
  - `init.sh` 扩展为四文件幂等校验；`check_books_ui.mjs` 扩展为三词书 61 项断言
- [x] harness 记录与 README / AGENTS.md 同步更新

## 验证证据

| 检查项 | 命令 | 结果 |
|---|---|---|
| 本功能浏览器回归 | `node scripts/check_books_ui.mjs` | **61/61 通过**（三书弹框 / 切第三本 / 223 页 4449 条 / 词性筛选 / 部首字符规范化 / 拼写题恢复 / 进度隔离 / v2 迁移 / 暗色移动端 / 无 JS 异常） |
| 完整门禁 | `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh` | 通过，四份词书数据一致，`out/` 已重新导出 |
| 视觉复核 | `shots/book-picker/01-first-visit.png`、`05b-4449-library.png`、`05c-4449-study.png` | 第三书卡风格与第一本对称，学习卡多义项分号合并、无乱码、无多余音标/例句区 |
| 存储回归 | `node scripts/check_migration.mjs` | 6 组断言全通过 |
| 数据一致性 | `git diff public/data/catalog.json public/data/books/phrases-764.json` | 空（既有两书字节不变） |

## 文件变更

- 新增：`docs/2027专升本英语你还在背单词吗.md`、`public/data/books/words-4449.json`
- 修改：`scripts/build_books.py`、`scripts/check_books_ui.mjs`、`init.sh`、`public/data/books/index.json`
- 修改：`AGENTS.md`、`feature_list.json`、`progress.md`、`session-handoff.md`、`README.md`
- 生成：`out/` 重新导出、`shots/book-picker/05b、05c` 截图
- 未改：`components/BloomApp.jsx`（清单驱动，前端零改动）、`components/userStorage.mjs`、`app/globals.css`

## 已做出的决策

- 卡片切换唯一入口 `useCardDeck`；入场动画原地淡入零位移（详见 AGENTS.md「不变式」）
- 进度分桶但组件层保持扁平视图；v2 迁移而非重置；清单是加词书的唯一扩展点
- 词组书保留原形态（含 `(sb)`、`…`），例句不进测验，不出拼写题
- 状态按钮只替换待复习卡片，不误删其它状态的「去沉浸学习」入口；写状态复用 `updateWordStatus`
- 4449 词书按原书 223 页分节、无难度分区（`hasSections=false`）、有词性分类、无音标例句；
  多义项分号合并，兼容字符统一成规范汉字（正文保留 `…`）
- 新书复用既有 pink 徽章，不自造新配色

## 阻塞 / 风险

- 无项目性阻塞。仅本机环境 `safe-delete` 守卫影响 `npm run build`（见 AGENTS.md 验证命令备注）
- `markMastered` 按「新池减少 1 张」预判；若将来支持多状态并集筛选，需改为通用的池长变化后索引归一化
- 4449 词书数据 917 KB，前端按需拉取（仅在选中时请求），首屏仍只取几 KB 清单，无性能风险

## 下一会话启动

1. 阅读 `AGENTS.md`。
2. 阅读 `feature_list.json` 与 `progress.md`。
3. 查看本交接文档。
4. 在编辑前运行 `./init.sh`（本机带额度前缀）。

## 下一步建议

- 提交 feat-016 到 `main`（推送后 GitHub Actions 自动发布第三本词书）
- 若用户希望「去沉浸学习」入口在所有状态下都保留，可在 `mastered` 分支补一个次级按钮
- 清理 `scripts/` 下历史临时诊断脚本（`_probe2.mjs`、`_swipe_diag.mjs`、`_swipe_verify2.mjs`）—— 需用户确认后执行
