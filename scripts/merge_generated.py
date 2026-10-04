import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
ICONS = ["sparkles", "users", "coffee", "home", "clock", "train", "heart", "zap", "palette", "help", "hand", "hash"]


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def strip_flags(node, flagged: list, where: str):
    if isinstance(node, dict):
        if "_flags" in node:
            flagged.append({"where": where, "de": node.get("de"), "issues": node.pop("_flags")})
        for v in node.values():
            strip_flags(v, flagged, where)
    elif isinstance(node, list):
        for v in node:
            strip_flags(v, flagged, where)


def main(source: Path) -> None:
    curriculum = load(CONTENT / "curriculum.json", {})
    units = {u["id"]: (lvl["id"], u) for lvl in curriculum["levels"] for u in lvl["units"]}
    lessons_by_level: dict[str, list] = {}
    decks_by_level: dict[str, list] = {}
    paragraphs = load(CONTENT / "paragraphs.json", [])
    known_paragraphs = {p["id"] for p in paragraphs}
    flagged: list = []
    merged_units = 0

    for path in sorted(source.glob("*.json")):
        if path.name.startswith("_"):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        unit_id = data["unit"]
        if unit_id not in units:
            continue
        level, unit = units[unit_id]
        strip_flags(data, flagged, unit_id)
        key = level.lower()
        if key not in lessons_by_level:
            lessons_by_level[key] = [l for l in load(CONTENT / f"lessons_{key}.json", []) if l["unit"] not in {unit_id}]
            decks_by_level[key] = load(CONTENT / f"vocab_{key}.json", [])
        lessons_by_level[key] = [l for l in lessons_by_level[key] if l["unit"] != unit_id] + data["lessons"]
        if data["words"]:
            seen = set()
            words = []
            for w in data["words"]:
                if w["de"] not in seen and w.get("ex", {}).get("de"):
                    seen.add(w["de"])
                    words.append(w)
            deck_id = f"{unit_id}-words"
            decks_by_level[key] = [d for d in decks_by_level[key] if d["id"] != deck_id]
            decks_by_level[key].append({
                "id": deck_id,
                "level": level,
                "title": unit["title"],
                "titleDe": unit["titleDe"],
                "icon": ICONS[int(unit_id.split("-u")[1]) % len(ICONS)],
                "words": words,
            })
            if deck_id not in unit["decks"]:
                unit["decks"].append(deck_id)
        for p in data["paragraphs"]:
            if p["id"] not in known_paragraphs:
                paragraphs.append(p)
                known_paragraphs.add(p["id"])
        merged_units += 1

    order = {u: i for i, u in enumerate(units)}
    for key, lessons in lessons_by_level.items():
        lessons.sort(key=lambda l: (order.get(l["unit"], 0), l["id"]))
        save(CONTENT / f"lessons_{key}.json", lessons)
    for key, decks in decks_by_level.items():
        if decks:
            decks.sort(key=lambda d: (order.get(d["id"].rsplit("-words", 1)[0], -1), d["id"]))
            save(CONTENT / f"vocab_{key}.json", decks)
    paragraphs.sort(key=lambda p: (["A1", "A2", "B1", "B2", "C1"].index(p["level"]), p["id"]))
    save(CONTENT / "paragraphs.json", paragraphs)
    save(CONTENT / "curriculum.json", curriculum)
    save(source / "_flagged.json", flagged)
    print(f"merged {merged_units} units, {len(flagged)} sentences still flagged by the grammar checker")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tmp" / "generated")
