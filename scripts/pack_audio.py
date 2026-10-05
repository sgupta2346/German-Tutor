import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
ARTICLE = {"m": "der", "f": "die", "n": "das", "pl": "die"}
GERMANISH = re.compile(r"[äöüßÄÖÜ]|\b(der|die|das|ich|du|er|sie|wir|ein|eine|mein|meine)\b")
EXTRA = ["Willkommen! Schön, dass du da bist.", "Wie schnell soll ich sprechen?", "Hallo, so klinge ich."]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def load(name: str):
    return json.loads((CONTENT / name).read_text(encoding="utf-8"))


def level_of_texts() -> dict[str, str]:
    owner: dict[str, str] = {}

    def add(text: str, pack: str) -> None:
        if text and norm(text) not in owner:
            owner[norm(text)] = pack

    for t in EXTRA:
        add(t, "core")
    for letter in load("alphabet.json"):
        for t in (letter["letter"], letter["name"], letter["example"]["de"]):
            add(t, "core")
    for sound in load("sounds.json"):
        for e in sound["examples"]:
            add(e["de"], "core")
        for a, b in sound["pairs"]:
            add(a, "core")
            add(b, "core")
    unit_level = {u["id"]: lvl["id"].lower() for lvl in load("curriculum.json")["levels"] for u in lvl["units"]}
    for lvl in ("a1", "a2", "b1", "b2", "c1"):
        path = CONTENT / f"vocab_{lvl}.json"
        if path.exists():
            for deck in load(path.name):
                for w in deck["words"]:
                    add(w["de"], lvl)
                    add(f"{ARTICLE[w['gender']]} {w['de']}" if w.get("gender") else w["de"], lvl)
                    add(w["ex"]["de"], lvl)
        path = CONTENT / f"lessons_{lvl}.json"
        if path.exists():
            for lesson in load(path.name):
                pack = unit_level.get(lesson["unit"], lvl)
                for s in lesson["steps"]:
                    if "de" in s:
                        add(s["de"], pack)
                    for row in s.get("table", []):
                        add(row[0], pack)
                    for p in s.get("points", []):
                        if GERMANISH.search(p):
                            add(p, pack)
                    for o in s.get("options", []):
                        if GERMANISH.search(o) or re.fullmatch(r"[a-zäöüß ,.!?]+", o, re.I):
                            add(o, pack)
                    if s["type"] == "build":
                        add(" ".join(s["answer"]), pack)
                        for t in s["answer"] + s["extra"]:
                            add(re.sub(r"[.,!?]", "", t), pack)
                    if s["type"] == "match":
                        for de, _ in s["pairs"]:
                            add(de, pack)
    for p in load("paragraphs.json"):
        add(p["de"], p["level"].lower())
    return owner


def main(src: Path, out: Path) -> None:
    manifest = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    owner = level_of_texts()
    out.mkdir(parents=True, exist_ok=True)
    packs: dict[str, dict] = {}
    files: dict[str, list] = {}
    groups: dict[str, list[tuple[str, str]]] = {}
    for text, key in manifest["files"].items():
        groups.setdefault(owner.get(norm(text), "core"), []).append((text, key))
    for voice in manifest["voices"]:
        for pack, items in groups.items():
            name = f"{voice}-{pack}.bin"
            offset = 0
            with open(out / name, "wb") as fh:
                for text, key in items:
                    data = (src / voice / f"{key}.mp3").read_bytes()
                    fh.write(data)
                    files.setdefault(text, [pack, {}])[1][voice] = [offset, len(data)]
                    offset += len(data)
            packs[f"{voice}-{pack}"] = {"bytes": offset, "count": len(items)}
    data = json.dumps({"version": 2, "voices": manifest["voices"], "packs": packs, "files": files}, ensure_ascii=False, separators=(",", ":"))
    (out / "manifest.json").write_text(data, encoding="utf-8")
    (CONTENT / "audio_manifest.json").write_text(data, encoding="utf-8")
    for k, v in sorted(packs.items()):
        print(f"{k}: {v['count']} clips, {v['bytes'] / 1e6:.1f} MB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
