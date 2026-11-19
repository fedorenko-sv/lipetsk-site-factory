"""Reproducible lossless WOFF2 siblings; install requirements into a local tools folder."""
import hashlib
import json
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
folder = root / "public/demo-assets/detailing/fonts"
result = []
for source in sorted(folder.glob("font-*.ttf")):
    target = source.with_suffix(".woff2")
    original = TTFont(source, recalcTimestamp=False)
    original.flavor = "woff2"
    original.save(target)
    converted = TTFont(target, recalcTimestamp=False)
    assert original.getBestCmap() == converted.getBestCmap(), "Unicode coverage changed"
    assert original["hmtx"].metrics == converted["hmtx"].metrics, "Glyph metrics changed"
    result.append({
        "source": source.name, "output": target.name,
        "sourceBytes": source.stat().st_size, "bytes": target.stat().st_size,
        "unicodeCharacters": len(converted.getBestCmap()),
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest()
    })
    original.close()
    converted.close()
(folder / "woff2-manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
print(json.dumps({"sourceBytes": sum(r["sourceBytes"] for r in result), "bytes": sum(r["bytes"] for r in result), "files": len(result)}))
