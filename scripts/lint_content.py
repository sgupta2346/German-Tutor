import json
import re
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / "content"
WORD = re.compile(r"[A-Za-zÄÖÜäöüß]+")


def broken_choice(step: dict) -> str | None:
    parts = re.split(r"_{3,}", step["prompt"], maxsplit=1)
    if len(parts) < 2:
        return None
    answer_words = WORD.findall(step["options"][step["answer"]])
    after = {w.lower() for w in WORD.findall(parts[1])}
    if len(answer_words) == 1 and answer_words[0].lower() in after:
        return f"answer '{answer_words[0]}' repeated after the blank"
    return None


ENGLISH = re.compile(r"\b(the|and|is|are|always|word|sentence|note|you|this|with|for|which|when)\b", re.I)
GERMAN_HINT = re.compile(r"[äöüß]|\b(der|die|das|ist|und|ich|nicht|ein|eine|sie|wir|zu|mit)\b", re.I)


def english_in_german(text: str) -> bool:
    english = len(ENGLISH.findall(text))
    german = len(GERMAN_HINT.findall(text))
    return english >= 2 and english > german


def main() -> None:
    dropped = []
    for path in sorted(CONTENT.glob("lessons_*.json")):
        lessons = json.loads(path.read_text(encoding="utf-8"))
        for lesson in lessons:
            kept = []
            for step in lesson["steps"]:
                reason = broken_choice(step) if step["type"] == "choice" else None
                if not reason and "de" in step and english_in_german(step["de"]):
                    reason = "English text in a German field"
                if reason:
                    dropped.append((lesson["id"], step.get("prompt") or step.get("de"), reason))
                else:
                    kept.append(step)
            lesson["steps"] = kept
        path.write_text(json.dumps(lessons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for d in dropped:
        print(*d, sep=" | ")
    print(f"{len(dropped)} broken choice steps dropped")


if __name__ == "__main__":
    main()
