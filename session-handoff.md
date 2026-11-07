# 会话交接

## 当前目标

- 目标：词间日和已上线（https://cheshiping.github.io/words-to-bachelor-s/），当前无进行中功能；新需求进来时先追加到 `feature_list.json`
- 当前状态：核心功能 + 多词书 + 记忆卡片一键掌握全部完成（feat-001 ~ feat-015 全 done）
- 分支 / 提交：`main`（推送即自动发布）；本次改动尚未提交，随下次提交一并入库

## 本次会话已完成

- [x] **feat-015：记忆卡片待复习词一键标为已掌握**
  - `review` 卡片底部「去沉浸学习」→「✓ 标为已掌握」，点击走 `updateWordStatus(id, "mastered")`
  - `mastered` 卡片显示禁用完成态「✓ 已掌握」；`new` / `learning` 卡片保留「去沉浸学习」
  - 按「待复习」筛选时卡片出池，`flash.index` 夹进新池范围，末位不出现空白卡 / 越界计数，队列清空显示空状态
  - 新 CTA 复用 `.pill` + 柔和纯色（无渐变），暗色与移动端同步适配
- [x] 新增 `scripts/check_flash_mastered.mjs`：自包含静态预览 + 无头 Chrome CDP 回归，30 项断言
- [x] harness 记录与 README 同步更新

## 验证证据

| 检查项 | 命令 | 结果 |
|---|---|---|
| 本功能浏览器回归 | `node scripts/check_flash_mastered.mjs` | **30/30 通过**（按钮三态 / 状态写入 / 出队与索引收敛 / 空状态 / 刷新持久化 / 首页统计 / 暗色 / 移动端 / 无 JS 异常） |
| 完整门禁 | `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh` | 通过，三份词书数据一致，`out/` 已重新导出 |
| 视觉复核 | `shots/flash-mastered/01~04.png` | 浅色新 CTA、点击后状态、已掌握/学习中态、暗色移动端均正常 |
| 存储回归（历史） | `node scripts/check_migration.mjs` | 6 组断言全通过 |
| 多词书回归（历史） | `node scripts/check_books_ui.mjs` | 44/44 通过 |

## 文件变更

- 修改：`components/BloomApp.jsx`（`FlashPage.markMastered` + 三态按钮）、`app/globals.css`（`.pill.mastered-cta`）
- 新增：`scripts/check_flash_mastered.mjs`
- 修改：`AGENTS.md`、`feature_list.json`、`progress.md`、`session-handoff.md`、`README.md`
- 生成：`out/` 重新导出、`shots/flash-mastered/` 4 张截图
- 未改：`public/data/` 三份词书数据、`components/userStorage.mjs`、`docs/` 两份词表 md

## 已做出的决策

- 卡片切换唯一入口 `useCardDeck`；入场动画原地淡入零位移（详见 AGENTS.md「不变式」）
- 进度分桶但组件层保持扁平视图；v2 迁移而非重置；清单是加词书的唯一扩展点
- 词组书保留原形态（含 `(sb)`、`…`），例句不进测验，不出拼写题
- 状态按钮只替换待复习卡片，不误删其它状态的「去沉浸学习」入口；写状态复用 `updateWordStatus`
- 状态变更不复制切卡动画；`flash.index` 只在池缩短时夹取

## 阻塞 / 风险

- 无项目性阻塞。仅本机环境 `safe-delete` 守卫影响 `npm run build`（见 AGENTS.md 验证命令备注）
- `markMastered` 按「新池减少 1 张」预判；若将来支持多状态并集筛选，需改为通用的池长变化后索引归一化

## 下一会话启动

1. 阅读 `AGENTS.md`。
2. 阅读 `feature_list.json` 与 `progress.md`。
3. 查看本交接文档。
4. 在编辑前运行 `./init.sh`（本机带额度前缀）。

## 下一步建议

- 加第三本词书：只改 `scripts/build_books.py` + `index.json`（前端已数据驱动，无需改动）
- 若用户希望「去沉浸学习」入口在所有状态下都保留，可在 `mastered` 分支补一个次级按钮
- 清理 `scripts/` 下历史临时诊断脚本（`_probe2.mjs`、`_swipe_diag.mjs`、`_swipe_verify2.mjs`）—— 需用户确认后执行
