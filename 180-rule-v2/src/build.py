"""Build index.html (one self-contained page) from the files in src/.

Usage:  python3 src/build.py      (run from the repository root)
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent
OUT = SRC.parent / 'index.html'

FAVICON = ("data:image/svg+xml,"
           "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
           "%3Cpath d='M4 13a12 12 0 0 0 24 0z' fill='%2334C77D' fill-opacity='.35'/%3E"
           "%3Cline x1='1' y1='13' x2='31' y2='13' stroke='%237B4DFF' stroke-width='2.6' stroke-dasharray='4 3'/%3E"
           "%3Ccircle cx='10' cy='13' r='3.6' fill='%23E7A33D'/%3E%3Ccircle cx='22' cy='13' r='3.6' fill='%233868BA'/%3E"
           "%3Crect x='13' y='23' width='7' height='5' rx='1.4' fill='%231A2430'/%3E%3C/svg%3E")

HEAD = f"""<!doctype html>
<html lang="zh-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>180度法則互動課</title>
<meta name="description" content="互動電影課：軸線、三機位、視線匹配、多機剪接，同埋越軸之後連戲點樣出錯。">
<meta property="og:title" content="180度法則互動課">
<meta property="og:description" content="互動電影課：軸線、三機位、視線匹配、多機剪接，同埋越軸之後連戲點樣出錯。">
<meta name="theme-color" content="#1C2833">
<link rel="icon" href="{FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+HK:wght@400;500;700;900&display=swap">
<style>
:root {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }}
body {{ margin: 0; }}
img {{ max-width: 100%; }}
"""


def main():
    css = (SRC / 'page.css').read_text(encoding='utf-8')
    body = (SRC / 'page.html').read_text(encoding='utf-8')
    js = (SRC / 'render.js').read_text(encoding='utf-8') + '\n' + (SRC / 'app.js').read_text(encoding='utf-8')
    page = (HEAD + css + '\n</style>\n</head>\n<body>\n' + body +
            '\n<script>\n' + js + '\n</script>\n</body>\n</html>\n')
    OUT.write_text(page, encoding='utf-8')
    print(f'wrote {OUT} ({len(page.encode("utf-8")):,} bytes)')


if __name__ == '__main__':
    main()
