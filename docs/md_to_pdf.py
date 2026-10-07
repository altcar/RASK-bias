"""Render a Markdown file in docs/ to PDF with headless Chrome.

Usage:  .venv/bin/python docs/md_to_pdf.py docs/PIPELINE_EXPLAINED.md
"""
import subprocess
import sys
from pathlib import Path

import re

import markdown

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CSS = """
@page { size: A4; margin: 18mm 16mm }
body { font-family: 'IBM Plex Sans', Arial, sans-serif; color: #12182B; font-size: 10.5pt; line-height: 1.5 }
h1 { font-family: 'Space Grotesk', Arial, sans-serif; font-size: 20pt; margin: 18pt 0 6pt; break-after: avoid }
h1:first-of-type { font-size: 24pt; margin-top: 0 }
h2 { font-family: 'Space Grotesk', Arial, sans-serif; font-size: 14pt; color: #2563C9; margin: 16pt 0 4pt; break-after: avoid }
code { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 9pt; background: #F1EFEA; padding: 1px 4px; border-radius: 3px }
pre { background: #12182B; color: #EEF0F5; padding: 10px 12px; border-radius: 6px; break-inside: avoid; overflow: hidden }
pre code { background: none; color: inherit; padding: 0; font-size: 8.5pt }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.5pt; break-inside: avoid }
th { background: #12182B; color: #EEF0F5; text-align: left; padding: 5px 8px }
td { border-bottom: 1px solid #E2DFD6; padding: 5px 8px; vertical-align: top }
tr:nth-child(even) td { background: #F8F7F3 }
hr { border: none; border-top: 1px solid #E2DFD6; margin: 14pt 0 }
li { margin: 2pt 0 }
p:has(+ pre), p:has(+ table) { break-after: avoid }
"""


def nest_lists(text):
    """Python-Markdown needs 4-space nesting; GitHub-style docs use 2. Double indents outside code fences."""
    out, in_fence = [], False
    for line in text.splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
        elif not in_fence:
            line = re.sub(r"^( +)", lambda m: m[1] * 2, line)
        out.append(line)
    return "\n".join(out)


def main(md_path):
    md_path = Path(md_path).resolve()
    body = markdown.markdown(nest_lists(md_path.read_text()), extensions=["tables", "fenced_code", "sane_lists"])
    html = (f'<!doctype html><html><head><meta charset="utf-8"><title>{md_path.stem}</title>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700'
            '&family=IBM+Plex+Sans:wght@400;600&family=JetBrains+Mono:wght@500&display=swap">'
            f"<style>{CSS}</style></head><body>{body}</body></html>")
    tmp = md_path.with_suffix(".tmp.html")
    tmp.write_text(html)
    out = md_path.with_suffix(".pdf")
    try:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        "--virtual-time-budget=15000", f"--print-to-pdf={out}", tmp.as_uri()],
                       check=True, capture_output=True)
    finally:
        tmp.unlink(missing_ok=True)
    print(out)


if __name__ == "__main__":
    main(sys.argv[1])
