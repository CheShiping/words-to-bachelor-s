# -*- coding: utf-8 -*-
"""词间日和 · 多词书构建管线。

用法:
    python scripts/build_books.py [输出根目录]

默认输出根目录为 public/data，会生成：

    catalog.json                 3500 词书（复用 build_catalog.py 的解析逻辑，保持字节一致）
    books/phrases-764.json       专升本真题核心词组（764 条）
    books/index.json             词书清单（前端只先取这份，再按选择拉对应词书）

以后新增词书：写一个 parse_xxx()，在 build() 里追加一个 JSON 与一条清单记录即可。
所有输出均为确定性生成（无时间戳、无随机），便于 init.sh 做幂等校验。
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_catalog import build as build_words_3500  # noqa: E402

MD_3500 = os.path.join(ROOT, "docs", "2027专升本零基础3500词汇.md")
MD_PHRASES = os.path.join(ROOT, "docs", "专升本真题核心词组.md")

PAGE_RE = re.compile(r"^##\s+第\s*(\d+)\s*页\s*·\s*(\d+)\s*[–\-—]\s*(\d+)\s*$")
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|")
APPENDIX_RE = re.compile(r"^##\s+附录\s*A")
TAG_RE = re.compile(r"^\s*([a-z]+)\.")

# 原文释义标签 → 词典库分类（取第一条释义的标签）
CATEGORY_MAP = {
    "usage": "固定用法",
    "phrv": "短语动词",
    "phr": "短语动词",
    "idm": "习语",
    "collocation": "搭配",
    "prep": "介词短语",
    "n": "名词词组",
    "v": "动词词组",
    "a": "形容词词组",
    "adj": "形容词词组",
}


def tidy(text):
    """压缩空白；中文之间的空格去掉（PDF 抽取残留）。"""
    text = re.sub(r"\s+", " ", str(text)).strip()
    return re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)


def parse_phrases(md_path):
    """解析 4 列表格：# / Word / Meaning / Example。附录 A 之后一律不读。"""
    with io.open(md_path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    collections = []
    words = []
    page = None
    seen = set()

    for line_no, raw in enumerate(lines, 1):
        line = raw.strip()
        if APPENDIX_RE.match(line):
            break
        m = PAGE_RE.match(line)
        if m:
            number = int(m.group(1))
            first, last = int(m.group(2)), int(m.group(3))
            page = {
                "id": "page-%02d" % number,
                "title": line[3:].strip(),  # 形如「第 1 页 · 1–20」
                "sortOrder": len(collections),
                "wordCount": 0,
                "range": [first, last],
            }
            collections.append(page)
            continue
        if not ROW_RE.match(line):
            continue

        parts = line.split("|")
        if len(parts) != 6:
            raise SystemExit("第 %d 行：表格列数异常（%d 段）: %s" % (line_no, len(parts), line[:120]))
        number = int(parts[1].strip())
        word = tidy(parts[2])
        meaning_raw = parts[3].strip()
        example_raw = parts[4].strip()

        if number in seen:
            raise SystemExit("第 %d 行：编号 %d 重复" % (line_no, number))
        seen.add(number)
        if page is None:
            raise SystemExit("第 %d 行：词条出现在任何页标题之前" % line_no)
        if not word or not meaning_raw or not example_raw:
            raise SystemExit("第 %d 行：Word / Meaning / Example 有空列" % line_no)

        # 多义项：原表格用 <br> 分行，数据层统一成中文分号，UI 零改动
        meaning = "；".join(tidy(part) for part in meaning_raw.split("<br>") if tidy(part))
        if not meaning:
            raise SystemExit("第 %d 行：释义解析后为空" % line_no)

        example_parts = [tidy(part) for part in example_raw.split("<br>") if tidy(part)]
        if len(example_parts) != 2:
            raise SystemExit("第 %d 行：例句应为「英文 + 中文译文」两行，实际 %d 行" % (line_no, len(example_parts)))
        example_en, example_zh = example_parts
        if not re.search(r"[A-Za-z]", example_en) or not re.search(r"[\u4e00-\u9fff]", example_zh):
            raise SystemExit("第 %d 行：例句中英文顺序异常: %s" % (line_no, example_raw[:100]))

        first_tag = TAG_RE.match(meaning.split("；")[0])
        category = CATEGORY_MAP.get(first_tag.group(1), "其他") if first_tag else "其他"

        words.append({
            "id": number,
            "number": number,
            "word": word,
            "meaning": meaning,
            "category": category,
            "collectionId": page["id"],
            "collectionTitle": page["title"],
            "exampleEn": example_en,
            "exampleZh": example_zh,
        })
        page["wordCount"] += 1

    expected = list(range(1, 765))
    if [w["number"] for w in words] != expected:
        missing = [n for n in expected if n not in seen]
        raise SystemExit("编号不连续，缺失: %s" % missing[:20])
    if len(collections) != 39:
        raise SystemExit("页分节数应为 39，实际 %d" % len(collections))
    return collections, words


def write_json(path, data):
    out_dir = os.path.dirname(os.path.abspath(path))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def read_json(path):
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def build(out_root):
    out_root = os.path.abspath(out_root)
    catalog_path = os.path.join(out_root, "catalog.json")
    phrases_path = os.path.join(out_root, "books", "phrases-764.json")
    index_path = os.path.join(out_root, "books", "index.json")

    # 1) 3500 词书：沿用原解析器，保证与既有 catalog.json 完全一致
    build_words_3500(MD_3500, catalog_path)
    words_3500 = read_json(catalog_path)

    # 2) 真题词组书
    collections, words = parse_phrases(MD_PHRASES)
    write_json(phrases_path, {
        "catalogIdVersion": 2,
        "bookId": "phrases-764",
        "source": os.path.basename(MD_PHRASES),
        "collections": collections,
        "words": words,
    })

    # 3) 词书清单（前端唯一入口，元信息由这里统一提供）
    index = {
        "manifestVersion": 1,
        "defaultBookId": "words-3500",
        "books": [
            {
                "id": "words-3500",
                "name": "2027 专升本零基础 3500 词",
                "shortName": "3500 词",
                "subtitle": "从零起步的核心词汇",
                "description": "按原书 33 组词集编排，含音标、词性与基础 / 进阶 / 高分难度分区。",
                "dataUrl": "/data/catalog.json",
                "wordCount": len(words_3500["words"]),
                "collectionCount": len(words_3500["collections"]),
                "hasSections": True,
                "spellingEnabled": True,
                "categoryLabel": "全部词性",
                "accent": "pink",
                "order": 1,
            },
            {
                "id": "phrases-764",
                "name": "专升本真题核心词组",
                "shortName": "真题词组",
                "subtitle": "历年真题高频搭配",
                "description": "764 个真题词组，按原书 39 页分节；每条配英文例句与中文译文，边读边记。",
                "dataUrl": "/data/books/phrases-764.json",
                "wordCount": len(words),
                "collectionCount": len(collections),
                "hasSections": False,
                "spellingEnabled": False,
                "categoryLabel": "全部分类",
                "accent": "gold",
                "order": 2,
            },
        ],
    }
    write_json(index_path, index)

    cats = {}
    for w in words:
        cats[w["category"]] = cats.get(w["category"], 0) + 1
    print("phrases: pages=%d words=%d categories=%s" % (len(collections), len(words), sorted(cats.items(), key=lambda kv: -kv[1])))
    print("manifest: %s" % ", ".join("%s(%d)" % (b["id"], b["wordCount"]) for b in index["books"]))
    print("output: %s" % out_root)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "public", "data"))
