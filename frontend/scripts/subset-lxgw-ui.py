#!/usr/bin/env python3
"""生成 C 端静态 UI 专用的霞鹜文楷轻便版子集（工单 #12 性能返工第二轮）。

背景：LXGW WenKai Lite 分片按 unicode-range 切分，首页只渲染 36 个静态中文字符
却要下载约 850KB 分片。本脚本把全站静态 UI 文案（CJK + CJK 标点）子集化成两个
小 woff2，作为独立字体族 'LXGW WenKai Lite UI' 插在分片字体族之前；子集未覆盖
的动态字符（文章正文等）自动落到分片，永不豆腐块（自愈）。

输出（提交进仓库，构建不依赖 python/网络）：
  frontend/public/fonts/lxgw-ui-regular.woff2  （weight 400）
  frontend/public/fonts/lxgw-ui-bold.woff2     （weight 700，与 Regular 同一字符集）

## UI 文案变更后重新生成

1. 起 preview（需先 npm run build）：
     cd frontend && npm run preview -- --port 4180 --strictPort
2. 用 ego-browser 逐页提取 body.innerText 的 CJK 字符并集（排除 .md-cyber 子树
   —— 那是数据库动态正文；排除 aria-hidden；含 / /posts /archive /moments
   /links /about /login /posts/<slug> 文章页 chrome）：
     ego-browser nodejs <<'EOF'
     ... 页面遍历 + createTreeWalker(SHOW_TEXT) 跳过 .md-cyber，收集
         /[一-鿿㐀-䶿豈-﫿，-〿．-ﾟ—]/ 字符取并集 ...
     EOF
3. 把新字符集替换进下方 UI_CHARSET（保持 codepoint 排序），注明日期与来源。
4. 重跑本脚本（自动下载 TTF 到缓存目录，TTF 不进仓库）并提交 woff2：
     python3.12 frontend/scripts/subset-lxgw-ui.py

源码扫描模式（辅助核对，扫 src/ 下字符串/注释里的 CJK，排除 admin 与测试）：
     python3.12 frontend/scripts/subset-lxgw-ui.py --scan
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# 静态 UI 字符集（2026-11-14 由 ego-browser 从本地 preview :4180 提取，共 125 个）：
# 逐页 innerText 并集（/、/posts、/archive、/moments、/links、/about、/login、
# /posts/<slug> chrome），排除 .md-cyber 子树与 aria-hidden。codepoint 升序。
# ---------------------------------------------------------------------------
UI_CHARSET = (
    "—、。一不与个中乙习于云交人位你入全关写删前动博卷去友发另可后回园在块外天好始学"
    "完宠客己已年座庭开归录念态悬情惊意我技接整文新无是最朋本术查案档模欢水活流浮漫点"
    "生甲留登的看碎空站章端篇维自舒节花落表计记论设评试读起足辱迎运返进连迹部重链闲阅"
    "除随页首，"
)

VERSION = "v1.250"
TTF_URLS = {
    "regular": f"https://github.com/lxgw/LxgwWenKai-Lite/releases/download/{VERSION}/LXGWWenKaiLite-Regular.ttf",
    "bold": f"https://github.com/lxgw/LxgwWenKai-Lite/releases/download/{VERSION}/LXGWWenKaiLite-Bold.ttf",
}

REPO = Path(__file__).resolve().parent.parent  # frontend/
PUBLIC_FONTS = REPO / "public" / "fonts"
CACHE_DIR = Path.home() / ".cache" / "blog-lxgw-subset"


def scan_source_charset() -> set[str]:
    """--scan：源码字符串/注释 CJK 并集（辅助核对，排除 admin 与测试）。"""
    import re

    cjk = re.compile(r"[\u2010-\u2027\u2030-\u205E\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]")
    src = REPO / "src"
    chars: set[str] = set()
    for path in src.rglob("*.ts*"):
        parts = path.relative_to(src).parts
        if parts[0] == "admin" or parts[0] == "test" or ".test." in path.name:
            continue
        chars.update(cjk.findall(path.read_text(encoding="utf-8")))
    return chars


def ensure_ttf(key: str) -> Path:
    """TTF 下载到缓存目录（不进仓库），已存在则复用。"""
    dest = CACHE_DIR / f"LXGWWenKaiLite-{key.capitalize()}.ttf"
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {TTF_URLS[key]}")
        urllib.request.urlretrieve(TTF_URLS[key], dest)  # noqa: S310
    return dest


def subset(key: str, text: str) -> Path:
    """pyftsubset：输出 woff2 子集到 public/fonts/。"""
    from fontTools import subset

    src = ensure_ttf(key)
    dest = PUBLIC_FONTS / f"lxgw-ui-{key}.woff2"
    PUBLIC_FONTS.mkdir(parents=True, exist_ok=True)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = []  # 楷体 UI 子集无需 OpenType 排版特性
    options.drop_tables += ["FFTM"]
    font = subset.load_font(src, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    subset.save_font(font, dest, options)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan", action="store_true", help="仅扫描源码 CJK 字符集（辅助核对）")
    args = parser.parse_args()

    if args.scan:
        chars = scan_source_charset()
        ordered = sorted(chars, key=ord)
        print(f"source scan: {len(ordered)} chars")
        print("".join(ordered))
        print("codepoints:", ",".join(f"U+{ord(c):04X}" for c in ordered))
        return

    chars = sorted(set(UI_CHARSET), key=ord)
    if len(chars) != len(UI_CHARSET):
        sys.exit("UI_CHARSET 含重复字符，请去重")
    text = "".join(chars)
    print(f"subset charset: {len(chars)} chars")
    for key in ("regular", "bold"):
        dest = subset(key, text)
        print(f"{key}: {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
