# -*- coding: utf-8 -*-
"""将《2027专升本零基础3500词汇.md》转换为词间日和的 catalog.json。

用法:
    python scripts/build_catalog.py [markdown路径] [输出json路径]

markdown 路径省略时，会按 DEFAULT_SRC_CANDIDATES 的顺序在仓库内自动定位词表。
"""
import io
import json
import os
import re
import sys

# 词表 Markdown 的候选位置（按优先级）
DEFAULT_SRC_CANDIDATES = [
    os.path.join("docs", "2027专升本零基础3500词汇.md"),
    "2027专升本零基础3500词汇.md",
]
DEFAULT_OUT = os.path.join("public", "data", "catalog.json")


def resolve_source(path=None):
    """定位词表 Markdown：显式路径 > 候选路径 > 仓库内搜索。"""
    if path:
        if not os.path.isfile(path):
            raise SystemExit("找不到词表文件: %s" % path)
        return path
    for candidate in DEFAULT_SRC_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "out", ".next", ".git")]
        for name in files:
            if name.endswith(".md") and "3500" in name:
                return os.path.join(dirpath, name)
    raise SystemExit("未找到词表 Markdown，请用 npm run catalog 或显式指定路径")

# ---------- 行级正则 ----------
HEADER_RE = re.compile(r"^\s*2027\s+老秦专升本\s+3500\s+词")
DASH = "-\u2013\u2014"
GROUP_RE = re.compile(
    r"^\s*第\s*(\d(?:\s*\d)*)\s*组\s*[（(]\s*(\d{1,4})\s*[" + DASH + r"]\s*(\d{1,4})\s*[)）]"
)
# 序号可能带点号，也可能被 PDF 拆成 "149 2" 这种带空格的形式
WORD_RE = re.compile(
    r"^\s*(?P<index>\d{1,4}(?:\s+\d{1,2})?)\.?\s+(?P<word>.+?)\s+/(?P<phonetic>[^/]*)/\s*(?P<tail>.*)$"
)
PAGE_RE = re.compile(r"^\s*\d{1,3}\s*$")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
CJK_PUNCT_RE = re.compile(r"[\uff0c\u3002\u3001\uff1b\uff1a\uff1f\uff01\u201c\u201d]")
MAX_CONT_LEN = 14  # 释义换行片段的长度上限（超过则视为闲聊噪声）

# ---------- 词性 ----------
KNOWN_POS = {
    "n", "v", "vt", "vi", "a", "ad", "adv", "adj", "prep", "pron",
    "num", "conj", "int", "aux", "art", "abbr", "modalv", "linkv", "modal",
}
POS_CATEGORY = {
    "n": "名词",
    "v": "动词", "vt": "动词", "vi": "动词",
    "a": "形容词", "adj": "形容词",
    "ad": "副词", "adv": "副词",
    "pron": "代词",
    "prep": "介词",
    "num": "数词",
    "conj": "连词",
    "int": "感叹词",
    "aux": "助动词",
    "art": "冠词",
    "abbr": "缩略词",
    "modalv": "情态动词",
    "linkv": "系动词",
}

# PDF 抽取时把少数单词拆开了，这里还原
WORD_FIXES = {
    "o ’ clock": "o'clock",
    "o ' clock": "o'clock",
    "caf é": "café",
    "caf e": "café",
}

# 难度分区（按词表原书的编排：小学基础 -> 高分难词）
SECTIONS = [
    (2200, "基础词"),
    (3000, "进阶词"),
    (99999, "高分词"),
]


def section_of(index):
    for limit, name in SECTIONS:
        if index <= limit:
            return name
    return SECTIONS[-1][1]


def clean_text(value):
    return " ".join(str(value).split()).strip()


def tidy(text):
    """整理释义：压缩空白，并去掉 PDF 换行拼接留下的汉字间空格。"""
    text = re.sub(r"\s+", " ", str(text)).strip()
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    return text


def is_pos_token(token):
    """判断 token 是否为词性标记，如 n. / vt. / n.&v. / v./n."""
    token = token.strip().lower()
    if not token.endswith("."):
        return False
    parts = [p for p in re.split(r"[./&]", token[:-1]) if p]
    return bool(parts) and all(p in KNOWN_POS for p in parts)


def split_tail(tail):
    """把尾部拆成 (词性, 释义)。尾部可能形如 'n. 回忆' 或 'a. 直接的 v. 指导'。"""
    text = tidy(tail)
    tokens = [t for t in text.split(" ") if t]
    pos = ""
    for token in tokens:
        if is_pos_token(token):
            pos = token
            break
    return pos, text


def is_continuation(line):
    """判断某行是否是释义被换行截断后剩下的片段（而不是闲聊噪声）。"""
    s = line.strip()
    if not s:
        return False
    if HEADER_RE.match(s) or PAGE_RE.match(s) or GROUP_RE.match(s) or WORD_RE.match(s):
        return False
    if CJK_PUNCT_RE.search(s) or "*" in s or "_" in s:
        return False
    if len(s) > MAX_CONT_LEN:
        return False
    return True


def join_tail(tail, nxt):
    """把换行片段接回释义：汉字之间不补空格。"""
    tail = tail.rstrip()
    nxt = nxt.strip()
    if not tail:
        return nxt
    if not nxt:
        return tail
    if CJK_RE.search(tail[-1]) and CJK_RE.match(nxt):
        return tail + nxt
    return tail + " " + nxt


def category_of(pos):
    if not pos:
        return "其他"
    for part in re.split(r"[./&]", pos.replace(" ", "").rstrip(".")):
        if part.lower() in POS_CATEGORY:
            return POS_CATEGORY[part.lower()]
    return "其他"


def parse(md_path):
    with io.open(md_path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    records = []
    groups = []
    current = None

    i = 0
    total = len(lines)
    while i < total:
        raw = lines[i]
        s = raw.strip()
        if not s:
            i += 1
            continue
        if HEADER_RE.match(s) or PAGE_RE.match(s):
            i += 1
            continue
        m = GROUP_RE.match(s)
        if m:
            number = int(re.sub(r"\s+", "", m.group(1)))
            current = {
                "id": "group-%02d" % number,
                "title": "第 %d 组" % number,
                "number": number,
                "section": None,
                "sortOrder": len(groups),
                "wordCount": 0,
                "firstIndex": None,
                "lastIndex": None,
            }
            groups.append(current)
            i += 1
            continue

        m = WORD_RE.match(s)
        if not m:
            # 音标被换行截断时（例如 misunderstand），把下一行拼进来重试
            if i + 1 < total:
                merged = re.sub(r"\s+", " ", s + " " + lines[i + 1].strip())
                m = WORD_RE.match(merged)
                if m:
                    i += 1

        if not m:
            # 闲聊行/非词条行，直接跳过
            i += 1
            continue

        index = int(re.sub(r"\s+", "", m.group("index")))
        word = clean_text(m.group("word"))
        word = WORD_FIXES.get(word, word)
        phonetic = clean_text(m.group("phonetic"))
        if phonetic.endswith(":"):
            phonetic += "/"  # 原文形如 /...tu:/ ，正则把结尾的 "/" 一并吃掉了
        tail = m.group("tail")

        # 释义被换行截断：尾部没有中文，或下一行以中文开头
        if i + 1 < total:
            nxt = lines[i + 1]
            if is_continuation(nxt):
                need_more = not CJK_RE.search(tail) or CJK_RE.match(nxt.strip()) is not None
                if need_more:
                    tail = join_tail(tail, nxt)
                    i += 1

        pos, meaning = split_tail(tail)

        if current is None:
            current = {
                "id": "group-01",
                "title": "第 1 组",
                "number": 1,
                "section": None,
                "sortOrder": 0,
                "wordCount": 0,
                "firstIndex": None,
                "lastIndex": None,
            }
            groups.append(current)

        records.append({
            "index": index,
            "word": word,
            "phonetic": phonetic,
            "pos": pos,
            "meaning": meaning,
            "group": current,
        })

        if current["firstIndex"] is None:
            current["firstIndex"] = index
        current["lastIndex"] = index
        i += 1

    return groups, records


def build(md_path, out_path):
    groups, records = parse(md_path)

    words = []
    seen = {}
    duplicates = []
    next_id = 1
    for rec in records:
        group = rec["group"]
        key = rec["word"].lower()
        if key in seen:
            duplicates.append((rec["word"], seen[key], rec["index"]))
            continue
        seen[key] = rec["index"]
        meaning = rec["meaning"]
        words.append({
            "id": next_id,
            "number": rec["index"],
            "word": rec["word"],
            "meaning": meaning,
            "phonetic": rec["phonetic"],
            "category": category_of(rec["pos"]),
            "collectionId": group["id"],
            "collectionTitle": group["title"],
            "section": section_of(rec["index"]),
        })
        next_id += 1

    collections = []
    for g in groups:
        g["wordCount"] = sum(1 for w in words if w["collectionId"] == g["id"])
        if g["firstIndex"] is not None:
            g["section"] = section_of(g["firstIndex"])
        else:
            g["section"] = SECTIONS[-1][1]
        collections.append({
            "id": g["id"],
            "title": g["title"],
            "section": g["section"],
            "sortOrder": g["sortOrder"],
            "wordCount": g["wordCount"],
            "range": [g["firstIndex"], g["lastIndex"]],
        })

    catalog = {
        "catalogIdVersion": 2,
        "source": os.path.basename(md_path),
        "collections": collections,
        "words": words,
    }
    out_dir = os.path.dirname(os.path.abspath(out_path))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    with io.open(out_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))

    print("groups=%d words=%d duplicates=%d" % (len(collections), len(words), len(duplicates)))
    for c in collections:
        print("  %-10s %-8s %4d  %s" % (c["id"], c["section"], c["wordCount"], c["title"]))
    if duplicates:
        print("duplicates:", duplicates[:20])
    empty = [w for w in words if not w["meaning"]]
    if empty:
        print("words without meaning:", [(w["word"], w["phonetic"]) for w in empty[:20]])
    no_phonetic = [w for w in words if not w["phonetic"]]
    if no_phonetic:
        print("words without phonetic:", [w["word"] for w in no_phonetic[:20]])
    cats = {}
    for w in words:
        cats[w["category"]] = cats.get(w["category"], 0) + 1
    print("categories:", sorted(cats.items(), key=lambda kv: -kv[1]))


if __name__ == "__main__":
    src = resolve_source(sys.argv[1] if len(sys.argv) > 1 else None)
    dst = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    build(src, dst)
