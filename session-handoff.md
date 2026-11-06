# 会话交接

## 当前目标

- 目标：词间日和已上线（https://cheshiping.github.io/words-to-bachelor-s/），当前无进行中功能；新需求进来时先追加到 `feature_list.json`
- 当前状态：核心功能 + 多词书全部完成（feat-001 ~ feat-014 全 done）
- 分支 / 提交：`main`（推送即自动发布）；本次改动随本次提交一并入库

## 本次会话已完成

- [x] 建立 Agent harness：AGENTS.md、feature_list.json、progress.md、init.sh、session-handoff.md
- [x] feat-012：进度按词书分桶（`components/userStorage.mjs`）、v2→v3 无损迁移、清单驱动按需加载
- [x] feat-013：`scripts/build_books.py` 统一管线，生成词组书 764 条与词书清单，`init.sh` 改为三文件幂等校验
- [x] feat-014：首访强制选书弹框 + 顶栏切换 + localStorage 记忆 + 例句/分类/测验/首页按书适配
- [x] 视觉适配：选书卡片复用 `.journal-card / .badge / .path-bar / .pill`（去掉自造的彩色竖边与高饱和按钮）、暗色主题、移动端；修掉顶栏导航标签换行

## 验证证据

| 检查项 | 命令 | 结果 |
|---|---|---|
| 存储回归 | `node scripts/check_migration.mjs` | 6 组断言全通过 |
| 数据幂等 | `python scripts/build_books.py <tmp>` + 三文件 diff | 一致；catalog.json 与改造前字节相同 |
| 浏览器回归 | `node scripts/check_books_ui.mjs` | **44/44 通过**（含 v2 迁移、切书隔离、暗色、移动端、组件一致性、无 JS 异常） |
| 完整门禁 | `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh` | 通过，out/ 已重新导出 |
| 视觉复核 | `shots/book-picker/01~07.png` | 浅色/暗色/移动端弹框、学习卡与卡片背面例句均正常 |

## 文件变更

- 新增：`components/userStorage.mjs`、`scripts/build_books.py`、`scripts/check_migration.mjs`、
  `scripts/check_books_ui.mjs`、`public/data/books/{index.json,phrases-764.json}`
- 修改：`components/BloomApp.jsx`、`app/globals.css`、`package.json`、`init.sh`、
  `AGENTS.md`、`feature_list.json`、`progress.md`、`session-handoff.md`、`README.md`
- 未改：`public/data/catalog.json`、`docs/` 两份词表 md

## 已做出的决策

- 卡片切换唯一入口 `useCardDeck`；入场动画原地淡入零位移（详见 AGENTS.md「不变式」）
- 进度分桶但组件层保持扁平视图；v2 迁移而非重置；清单是加词书的唯一扩展点
- 词组书保留原形态（含 `(sb)`、`…`），例句不进测验，不出拼写题

## 阻塞 / 风险

- 无项目性阻塞。仅本机环境 `safe-delete` 守卫影响 `npm run build`（见 AGENTS.md 验证命令备注）

## 下一会话启动

1. 阅读 `AGENTS.md`。
2. 阅读 `feature_list.json` 与 `progress.md`。
3. 查看本交接文档。
4. 在编辑前运行 `./init.sh`（本机带额度前缀）。

## 下一步建议

- 加第三本词书：只改 `scripts/build_books.py` + `index.json`（前端已数据驱动，无需改动）
- 清理 `scripts/` 下历史临时诊断脚本（`_probe2.mjs`、`_swipe_diag.mjs`、`_swipe_verify2.mjs`）—— 需用户确认后执行
