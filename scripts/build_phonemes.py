import json
import re
from pathlib import Path

import espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper

EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())

from phonemizer import phonemize
from phonemizer.separator import Separator

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
WORD = re.compile(r"[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*")
STRIP = set("ˈˌ‿̯̩͡-.")


def german_strings(node, key=None):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from german_strings(v, k)
    elif isinstance(node, list):
        for item in node:
            yield from german_strings(item, key)
    elif isinstance(node, str) and key in {"de", "name", "pairs", "answer", "extra", "options", "letter", "prompt", "table", "points"}:
        yield node


def clean(phone: str) -> str:
    return "".join(ch for ch in phone if ch not in STRIP)


def main() -> None:
    words: set[str] = set()
    for path in sorted(CONTENT.glob("*.json")):
        if path.name == "phonemes.json":
            continue
        for text in german_strings(json.loads(path.read_text(encoding="utf-8"))):
            words.update(WORD.findall(text))
    ordered = sorted(words)
    out = phonemize(
        ordered,
        language="de",
        backend="espeak",
        separator=Separator(phone=" ", word="", syllable=""),
        strip=True,
        with_stress=False,
        njobs=1,
    )
    table = {}
    for word, phones in zip(ordered, out):
        cleaned = [clean(p) for p in phones.split()]
        table[word] = " ".join(p for p in cleaned if p)
    (CONTENT / "phonemes.json").write_text(json.dumps(table, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    print(f"{len(table)} words")


if __name__ == "__main__":
    main()
