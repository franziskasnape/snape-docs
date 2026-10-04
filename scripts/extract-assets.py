#!/usr/bin/env python3
"""One-off: pull the embedded fonts and footer seal out of an existing offer HTML.

Usage: python3 scripts/extract-assets.py path/to/offer.html
Writes public/fonts/<Family>-<weight>.otf and public/seal.png
"""
import base64, re, sys, pathlib

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(__file__).resolve().parent.parent / "public"
(out / "fonts").mkdir(parents=True, exist_ok=True)

face = re.compile(
    r'@font-face\s*\{\s*font-family:\s*"([^"]+)";\s*src:\s*url\(data:font/otf;base64,([A-Za-z0-9+/=]+)\)'
    r'[^}]*?font-weight:\s*(\d+)', re.S)
for fam, b64, wt in face.findall(src):
    p = out / "fonts" / f"{fam}-{wt}.otf"
    p.write_bytes(base64.b64decode(b64))
    print("font", p.name, p.stat().st_size)

m = re.search(r'class="footer-seal" src="data:image/png;base64,([A-Za-z0-9+/=]+)"', src)
(out / "seal.png").write_bytes(base64.b64decode(m.group(1)))
print("seal.png", (out / "seal.png").stat().st_size)
