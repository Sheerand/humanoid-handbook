#!/usr/bin/env python3
"""Build the self-contained site and run deterministic checks.

    python3 web/build.py [--links] [--no-write]

Reads  web/src/template.html, web/src/styles/*.css, web/src/scripts/*.js,
       web/src/sections/NN-*.html
Writes web/index.html, temp/build/report.json, temp/build/page.txt

Exit 0 when there are no errors (warnings allowed), 1 when errors exist.
The last stdout line is ``BUILD_JSON:{...}`` for machine consumption.
"""
from __future__ import annotations

import glob
import html as htmllib
import json
import os
import re
import subprocess
import sys
from html.parser import HTMLParser

_HERE = os.path.dirname(os.path.abspath(__file__))
WEB = _HERE if os.path.isdir(os.path.join(_HERE, "src")) else os.path.join(_HERE, "web")
ROOT = os.path.dirname(WEB)
WEB = os.path.join(ROOT, "web")
SRC = os.path.join(WEB, "src")
SECTIONS = os.path.join(SRC, "sections")
OUT = os.path.join(WEB, "index.html")
BUILD_DIR = os.path.join(ROOT, "temp", "build")

CHAPTERS = [
    ("01", "overview", "全景"),
    ("02", "mechanical", "机械设计"),
    ("03", "hardware", "硬件系统"),
    ("04", "embedded", "嵌入式软件"),
    ("05", "dynamics", "动力学与全身控制"),
    ("06", "gait", "步态与 MPC"),
    ("07", "rl", "强化学习与 Sim2Real"),
    ("08", "perception", "感知、状态估计与操作"),
    ("09", "roadmap", "全栈路线图与论文索引"),
]
CH_IDS = [c[0] for c in CHAPTERS]

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
OPTIONAL_END = {"li", "p", "td", "tr", "th", "option", "dt", "dd", "thead", "tbody"}
CJK = re.compile(r"[\u4e00-\u9fff]")


class Checker(HTMLParser):
    """Collects ids, anchors, tag balance, figures, code blocks and external links."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.mismatch: list[str] = []
        self.ids: list[str] = []
        self.anchors: list[str] = []
        self.tags: dict[str, int] = {}
        self.external_links = 0
        self.images: list[str] = []
        self._in_pre = 0

    def handle_starttag(self, tag, attrs):
        self.tags[tag] = self.tags.get(tag, 0) + 1
        a = dict(attrs)
        if "id" in a and a["id"]:
            self.ids.append(a["id"])
        href = a.get("href") or ""
        if href.startswith("#") and len(href) > 1:
            self.anchors.append(href[1:])
        if href.startswith("http"):
            self.external_links += 1
        if tag == "img":
            self.images.append(a.get("src", ""))
        if tag in ("script", "link", "iframe"):
            src = a.get("src") or a.get("href") or ""
            if src.startswith("http"):
                self.images.append(src)
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.mismatch.append(f"第 {self.getpos()[0]} 行：多余的 </{tag}>")
            return
        top, line = self.stack[-1]
        if top == tag:
            self.stack.pop()
            return
        # tolerate optional closing tags and mismatched inline tags
        for i in range(len(self.stack) - 1, max(-1, len(self.stack) - 8), -1):
            if self.stack[i][0] == tag:
                for t, _ in self.stack[i + 1:]:
                    if t not in OPTIONAL_END:
                        self.mismatch.append(
                            f"第 {line} 行：<{top}> 未闭合就遇到 </{tag}>（可能漏了 </{top}>）")
                del self.stack[i:]
                return
        self.mismatch.append(f"第 {self.getpos()[0]} 行：</{tag}> 没有对应的开始标签")


def text_of(html: str) -> str:
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"</(p|div|li|h[1-6]|tr|figcaption|blockquote|pre|table)>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    html = htmllib.unescape(html)
    html = re.sub(r"[ \t]+", " ", html)
    return re.sub(r"\n{3,}", "\n\n", html).strip()


def read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def inline_assets(html: str, errors: list[str], warnings: list[str],
                  inlined_js: list[str] | None = None) -> str:
    def css_repl(m: re.Match) -> str:
        href = m.group(1)
        path = os.path.join(SRC, href)
        if href.startswith("http"):
            errors.append(f"模板引用了外部样式（必须自包含）：{href}")
            return m.group(0)
        if not os.path.isfile(path):
            errors.append(f"模板引用的样式文件不存在：web/src/{href}")
            return m.group(0)
        return "<style>\n" + read(path) + "\n</style>"

    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', css_repl, html,
                  flags=re.I)

    def js_repl(m: re.Match) -> str:
        src = m.group(1)
        path = os.path.join(SRC, src)
        if src.startswith("http"):
            errors.append(f"模板引用了外部脚本（必须自包含）：{src}")
            return m.group(0)
        if not os.path.isfile(path):
            errors.append(f"模板引用的脚本不存在：web/src/{src}")
            return m.group(0)
        if inlined_js is not None:
            inlined_js.append(os.path.abspath(path))
        code = read(path)
        if "</script" in code:
            errors.append(f"脚本 {src} 中含有 </script> 字面量，无法内联")
        return "<script>\n" + code + "\n</script>"

    return re.sub(r'<script[^>]*src="([^"]+)"[^>]*>\s*</script>', js_repl, html, flags=re.I)


def collect_section_files(errors: list[str]) -> list[tuple[str, str, str]]:
    files = sorted(glob.glob(os.path.join(SECTIONS, "*.html")))
    found: dict[str, str] = {}
    for path in files:
        name = os.path.basename(path)
        if name.startswith("_"):
            continue
        m = re.match(r"^(\d{2})-([a-z0-9-]+)\.html$", name)
        if not m:
            errors.append(f"章节文件名不符合 NN-slug.html：{name}")
            continue
        num = m.group(1)
        if num in found:
            errors.append(f"章节 {num} 重复：{os.path.basename(found[num])} 与 {name}")
            continue
        found[num] = path
    missing = [c for c in CH_IDS if c not in found]
    if missing:
        errors.append("缺少章节文件：" + "、".join(f"{c}-*.html" for c in missing))
    extra = [n for n in found if n not in CH_IDS]
    if extra:
        errors.append("存在未知章节编号：" + "、".join(extra))
    return [(num, found[num], os.path.basename(found[num])) for num in CH_IDS if num in found]


def check_chapter(num: str, path: str, name: str, html: str, errors: list[str],
                  warnings: list[str], stats: dict) -> None:
    body = re.sub(r"^\s*(<!--.*?-->\s*)*", "", html, flags=re.S)
    if not re.match(rf'<section\b[^>]*\bid="ch-{num}"', body):
        errors.append(f"{name}：必须以 <section id=\"ch-{num}\" ...> 开始")
    if f'data-chapter="{num}"' not in body:
        errors.append(f"{name}：<section> 上缺少 data-chapter=\"{num}\"")
    figures = len(re.findall(r"<figure\b", body))
    pres = len(re.findall(r"<pre\b", body))
    h2s = len(re.findall(r"<h2\b", body))
    txt = text_of(body)
    chars = len(CJK.findall(txt))
    links = len(re.findall(r'href="https?://', body))
    takeaways = len(re.findall(r"data-takeaways", body))
    stats["chapters"].append({
        "num": num, "file": name, "cjk": chars, "figures": figures,
        "code": pres, "h2": h2s, "links": links, "takeaways": takeaways,
    })
    if figures < 2:
        errors.append(f"{name}：至少需要 2 个 <figure> 图示，目前 {figures} 个")
    if pres < 1:
        errors.append(f"{name}：至少需要 1 个 <pre> 代码块，目前 {pres} 个")
    if h2s < 2:
        errors.append(f"{name}：至少需要 2 个 <h2> 小节，目前 {h2s} 个")
    if links < 2:
        errors.append(f"{name}：至少需要 2 个外部链接（论文/项目），目前 {links} 个")
    if takeaways < 1:
        errors.append(f"{name}：缺少 data-takeaways 小结区块")
    if chars < 700:
        errors.append(f"{name}：正文仅 {chars} 个汉字，内容量不足（要求 ≥1400，硬下限 700）")
    elif chars < 1400:
        warnings.append(f"{name}：正文 {chars} 个汉字，偏短（目标 1400+）")


def main() -> int:
    want_links = "--links" in sys.argv
    no_write = "--no-write" in sys.argv
    errors: list[str] = []
    warnings: list[str] = []
    stats: dict = {"chapters": []}

    os.makedirs(BUILD_DIR, exist_ok=True)
    template_path = os.path.join(SRC, "template.html")
    if not os.path.isfile(template_path):
        print("BUILD_JSON:" + json.dumps({"errors": ["web/src/template.html 不存在"]},
                                         ensure_ascii=False))
        return 1

    template = read(template_path)
    sections = collect_section_files(errors)
    bodies = []
    for num, path, name in sections:
        html = read(path)
        check_chapter(num, path, name, html, errors, warnings, stats)
        bodies.append(f"<!-- ===== {name} ===== -->\n" + html)

    page = template
    if "<!-- SECTIONS -->" not in page:
        errors.append("模板缺少 <!-- SECTIONS --> 占位标记")
    else:
        page = page.replace("<!-- SECTIONS -->", "\n".join(bodies))
    inlined_js: list[str] = []
    page = inline_assets(page, errors, warnings, inlined_js)

    # Scripts present in src/scripts but not referenced by the template are appended
    # automatically, so chapter authors can add a demo without touching the shell.
    extra_js = [p for p in sorted(glob.glob(os.path.join(SRC, "scripts", "*.js")))
                if os.path.abspath(p) not in inlined_js]
    for path in extra_js:
        code = read(path)
        if "</script" in code:
            errors.append(f"脚本 {os.path.basename(path)} 中含有 </script> 字面量，无法内联")
            continue
        page = page.replace("</body>", "<script>\n" + code + "\n</script>\n</body>")
        inlined_js.append(os.path.abspath(path))
    if inlined_js:
        stats["scripts"] = [os.path.basename(p) for p in inlined_js]

    # ---- global checks -------------------------------------------------
    chk = Checker()
    chk.feed(page)
    if chk.stack:
        left = "、".join(f"<{t}>（第 {ln} 行）" for t, ln in chk.stack[:8])
        errors.append(f"有未闭合的标签：{left}")
    errors.extend(chk.mismatch[:12])

    dup = sorted({i for i in chk.ids if chk.ids.count(i) > 1})
    if dup:
        errors.append("重复的元素 id：" + "、".join(dup[:12]))
    known = set(chk.ids)
    dead = sorted({a for a in chk.anchors if a not in known})
    if dead:
        errors.append("指向不存在 id 的锚点：" + "、".join("#" + d for d in dead[:12]))

    for c in CH_IDS:
        if f'id="ch-{c}"' not in page:
            errors.append(f"页面中没有 id=\"ch-{c}\" 的章节")
        elif f'href="#ch-{c}"' not in page:
            warnings.append(f"章节 ch-{c} 没有被导航链接引用")
    if chk.tags.get("svg", 0) < 10:
        warnings.append(f"整页只有 {chk.tags.get('svg', 0)} 个 <svg>，图示可能不足")

    if chk.images:
        errors.append("页面引用了外部资源（必须完全自包含）：" + "、".join(chk.images[:6]))
    if re.search(r"@import\s+url\(\s*['\"]?https?:", page):
        errors.append("CSS 中存在外部 @import")

    leftovers = re.findall(r"(TODO|FIXME|待补充|占位文本|Lorem ipsum)", page)
    if leftovers:
        errors.append("页面残留占位内容：" + "、".join(sorted(set(leftovers))))
    if re.search(r"\bundefined\b|\[object Object\]|NaN%", text_of(page)):
        warnings.append("文本中出现了 undefined / [object Object] / NaN%，可能是模板拼接残留")

    # CSS custom properties
    defined = set(re.findall(r"(--[a-z0-9-]+)\s*:", page))
    used = set(re.findall(r"var\(\s*(--[a-z0-9-]+)", page))
    undefined = sorted(used - defined)
    if undefined:
        errors.append("使用了未定义的 CSS 变量：" + "、".join(undefined[:10]))

    # demo wiring
    demos = sorted(set(re.findall(r'data-demo="([^"]+)"', page)))
    scripts_dir = os.path.join(SRC, "scripts")
    script_files = sorted(glob.glob(os.path.join(scripts_dir, "*.js")))
    all_js = "\n".join(read(p) for p in script_files)
    for d in demos:
        if d not in all_js:
            warnings.append(f"演示 {d} 在 HTML 中出现，但没有任何脚本引用它")

    # JS syntax via node --check
    node = os.path.join(ROOT, "temp", "toolchain", "node", "bin", "node")
    js_dir = os.path.join(BUILD_DIR, "js-check")
    os.makedirs(js_dir, exist_ok=True)
    if os.path.isfile(node):
        for path in script_files:
            target = os.path.join(js_dir, os.path.basename(path))
            with open(target, "w", encoding="utf-8") as f:
                f.write(read(path))
            proc = subprocess.run([node, "--check", target], capture_output=True, text=True)
            if proc.returncode != 0:
                tail = (proc.stderr or "").strip().splitlines()
                errors.append(f"JS 语法错误 {os.path.basename(path)}：{tail[-1] if tail else '未知'}")
    else:
        warnings.append("未找到 node，跳过 JS 语法检查")

    stats.update({
        "bytes": len(page.encode("utf-8")),
        "cjkTotal": len(CJK.findall(text_of(page))),
        "svg": chk.tags.get("svg", 0),
        "canvas": len(re.findall(r"<canvas\b", page)),
        "figures": len(re.findall(r"<figure\b", page)),
        "pre": len(re.findall(r"<pre\b", page)),
        "demos": demos,
        "externalLinks": chk.external_links,
        "errors": errors,
        "warnings": warnings,
    })

    if not no_write:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(page)
        with open(os.path.join(BUILD_DIR, "page.txt"), "w", encoding="utf-8") as f:
            f.write(text_of(page))
        with open(os.path.join(BUILD_DIR, "report.json"), "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)

    links_report = None
    if want_links:
        links_report = check_links(page)
        stats["links"] = links_report
        if links_report["dead"]:
            warnings.append(f"有 {len(links_report['dead'])} 个外链打不开")

    print(f"章节 {len(stats['chapters'])} | 汉字 {stats['cjkTotal']} | svg {stats['svg']} | "
          f"canvas {stats['canvas']} | figure {stats['figures']} | code {stats['pre']} | "
          f"demo {len(demos)} | 外链 {stats['externalLinks']} | {stats['bytes']//1024} KB")
    for w in warnings:
        print("WARN " + w)
    for e in errors:
        print("ERR  " + e)
    payload = json.dumps(stats, ensure_ascii=False)
    if len(payload) > 30000:
        payload = json.dumps({k: v for k, v in stats.items() if k != "links"}, ensure_ascii=False)
    print("BUILD_JSON:" + payload)
    return 1 if errors else 0


def check_links(page: str) -> dict:
    import concurrent.futures as cf

    import requests

    urls = sorted(set(re.findall(r'href="(https?://[^"#]+)"', page)))
    dead, ok = [], 0
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                             "(KHTML, like Gecko) Chrome/124 Safari/537.36"}

    def probe(url: str):
        try:
            r = requests.head(url, allow_redirects=True, timeout=12, headers=headers)
            if r.status_code in (403, 405, 429, 503):
                r = requests.get(url, allow_redirects=True, timeout=15, headers=headers, stream=True)
            return url, r.status_code
        except Exception as exc:  # noqa: BLE001
            return url, f"ERR {type(exc).__name__}"

    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        for url, code in pool.map(probe, urls):
            if isinstance(code, int) and code < 400:
                ok += 1
            elif isinstance(code, int) and code in (403, 405, 429):
                ok += 1  # reachable but bot-blocked
            else:
                dead.append({"url": url, "status": str(code)})
    return {"total": len(urls), "ok": ok, "dead": dead[:40]}


if __name__ == "__main__":
    sys.exit(main())
