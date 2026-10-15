import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "requests"], check=True)
subprocess.run(["git", "clone", "--depth", "1", "https://github.com/sgupta2346/German-Tutor.git", "/kaggle/working/repo"], check=True)
subprocess.run("apt-get install -y -qq zstd > /dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq zstd)", shell=True, check=True)
subprocess.run("curl -fsSL https://ollama.com/install.sh | sh", shell=True, check=True)

import requests

env = dict(os.environ, OLLAMA_NUM_PARALLEL="4", OLLAMA_MAX_LOADED_MODELS="1", OLLAMA_FLASH_ATTENTION="1", OLLAMA_KEEP_ALIVE="-1")
server = subprocess.Popen(["ollama", "serve"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try:
        requests.get("http://127.0.0.1:11434/api/tags", timeout=2)
        break
    except Exception:
        time.sleep(1)

MODEL = None
for candidate in os.environ.get("MODELS", "gemma4:26b,gemma3:27b").split(","):
    if subprocess.run(["ollama", "pull", candidate]).returncode == 0:
        MODEL = candidate
        break
if MODEL is None:
    raise SystemExit("no model could be pulled")
print("using", MODEL, flush=True)

REPO = Path("/kaggle/working/repo/content")
WORD = re.compile(r"[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*")


def load(name):
    return json.loads((REPO / name).read_text(encoding="utf-8"))


texts: dict[str, str] = {}


def add(de: str, en: str = "") -> None:
    de = de.strip()
    if de and WORD.search(de) and de not in texts:
        texts[de] = en


for path in sorted(REPO.glob("lessons_*.json")):
    for lesson in load(path.name):
        for s in lesson["steps"]:
            if "de" in s:
                add(s["de"], s.get("en", ""))
            for row in s.get("table", []):
                add(row[0], row[1])
            for p in s.get("points", []):
                add(p)
            if s["type"] == "build":
                add(" ".join(s["answer"]), s["en"])
            if s["type"] == "match":
                for a, b in s["pairs"]:
                    add(a, b)
            if s["type"] == "choice":
                add(s["prompt"])
                for o in s["options"]:
                    add(o)
for path in sorted(REPO.glob("vocab_*.json")):
    for deck in load(path.name):
        for w in deck["words"]:
            add(w["ex"]["de"], w["ex"]["en"])
for p in load("paragraphs.json"):
    add(p["de"], p["en"])
print(len(texts), "texts", flush=True)

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "tokens": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "w": {"type": "string"},
                                "german": {"type": "boolean"},
                                "lemma": {"type": "string"},
                                "pos": {"type": "string", "enum": ["NOUN", "VERB", "ADJ", "ADV", "PRON", "DET", "ADP", "CONJ", "NUM", "PART", "INTJ", "PROPN", "OTHER"]},
                                "en": {"type": "string"},
                            },
                            "required": ["w", "german", "lemma", "pos", "en"],
                        },
                    },
                },
                "required": ["id", "tokens"],
            },
        }
    },
    "required": ["items"],
}


def prompt(batch: list[tuple[int, str, str]]) -> str:
    lines = "\n".join(f'{i}. "{de}"' + (f'  (meaning: "{en}")' if en else "") for i, de, en in batch)
    return f"""You are making a word-by-word glossary for a German course for English speakers.
For each numbered text, list EVERY word token in order, exactly as written (same spelling and capitalisation, punctuation removed, hyphenated words kept as one token).
For each token give:
- german: true if it is a German word, false if it is English (some texts are English instructions with a blank like ___).
- lemma: the German dictionary form (infinitive for verbs, nominative singular for nouns with no article, base form for adjectives). For English tokens repeat the token.
- pos: part of speech.
- en: a short English meaning of the word as it is used in THIS text (1 to 4 words). For articles and pronouns give the plain meaning (der -> the, ihr -> her / their / you as fits).

Texts:
{lines}

Return JSON with items: one entry per text with its id and tokens."""


def ask(batch):
    for attempt in range(4):
        try:
            r = requests.post(
                "http://127.0.0.1:11434/api/generate",
                json={"model": MODEL, "prompt": prompt(batch), "format": SCHEMA, "stream": False, "options": {"temperature": 0.1 + 0.1 * attempt, "num_ctx": 8192, "num_predict": 8000}},
                timeout=1800,
            )
            return json.loads(r.json().get("response", ""))
        except Exception as exc:
            print("retry", attempt, exc, flush=True)
    return {"items": []}


stats = Counter()
results: dict[str, list] = {}


def valid(de: str, tokens: list[dict]) -> bool:
    return [t["w"] for t in tokens] == WORD.findall(de)


def run_batch(batch):
    data = ask(batch)
    got = {it.get("id"): it.get("tokens", []) for it in data.get("items", [])}
    retry = []
    for i, de, en in batch:
        toks = got.get(i, [])
        if valid(de, toks):
            results[de] = toks
            stats["ok_first"] += 1
        else:
            retry.append((i, de, en))
    for i, de, en in retry:
        toks = ask([(1, de, en)]).get("items", [{}])
        toks = toks[0].get("tokens", []) if toks else []
        if valid(de, toks):
            results[de] = toks
            stats["ok_retry"] += 1
        else:
            stats["failed"] += 1


items = [(i, de, en) for i, (de, en) in enumerate(texts.items(), 1)]
batches = [items[k : k + 12] for k in range(0, len(items), 12)]
started = time.time()
with ThreadPoolExecutor(max_workers=4) as pool:
    for n, _ in enumerate(pool.map(run_batch, batches), 1):
        if n % 20 == 0:
            print(f"{n}/{len(batches)} batches, {dict(stats)}, {time.time() - started:.0f}s", flush=True)

out = Path("/kaggle/working/glossary_raw.json")
out.write_text(json.dumps({"model": MODEL, "stats": dict(stats), "texts": results}, ensure_ascii=False), encoding="utf-8")
print("done", dict(stats), flush=True)
server.terminate()
subprocess.run(["rm", "-rf", "/kaggle/working/repo"], check=True)
