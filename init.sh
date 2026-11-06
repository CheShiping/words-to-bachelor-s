#!/bin/bash
# 词间日和 · 验证门禁：依赖安装 + 词库一致性 + 构建 + 产物检查
set -e
cd "$(dirname "$0")"

echo "=== Harness 初始化 ==="

# 1. 依赖
if [ ! -d node_modules ]; then
  echo "=== npm install（node_modules 缺失）==="
  npm install
fi

# 2. 词库一致性：重新生成全部词书与清单，与仓库内文件比对（应幂等）
if command -v python >/dev/null 2>&1; then
  echo "=== 词库一致性检查（多词书） ==="
  TMP_DIR=".catalog-verify.tmp"
  rm -rf "$TMP_DIR" 2>/dev/null || true
  python scripts/build_books.py "$TMP_DIR" >/dev/null
  VERIFY_OK=1
  for rel in "catalog.json" "books/phrases-764.json" "books/index.json"; do
    if ! diff -q "$TMP_DIR/$rel" "public/data/$rel" >/dev/null 2>&1; then
      echo "验证失败：public/data/$rel 与重新生成结果不一致。"
      VERIFY_OK=0
    fi
  done
  rm -rf "$TMP_DIR" 2>/dev/null || true
  if [ "$VERIFY_OK" -ne 1 ]; then
    echo "          若属预期（词表或解析器有变更），请运行 npm run catalog 更新仓库内数据。"
    exit 1
  fi
  echo "三份词书数据一致。"
else
  echo "警告：未找到 python，跳过词库一致性检查（构建不受影响）。"
fi

# 3. 构建（真实验证门槛）
echo "=== npm run build ==="
npm run build

# 4. 产物检查
if [ ! -f out/index.html ]; then
  echo "验证失败：out/index.html 不存在，静态导出未生成。"
  exit 1
fi

echo ""
echo "=== 验证完成：构建通过，out/ 已重新导出 ==="
echo "下一步："
echo "1. 阅读 feature_list.json 查看当前功能状态"
echo "2. 挑选一个未完成的「单一功能」着手"
echo "3. 只实现该功能"
echo "4. 在声称完成前重新运行 ./init.sh"
