import csv
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "language_tool_python", "requests"], check=True)
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
for candidate in os.environ.get("MODELS", "gemma4:26b,gemma3:27b,qwen3:32b").split(","):
    if subprocess.run(["ollama", "pull", candidate]).returncode == 0:
        MODEL = candidate
        break
if MODEL is None:
    raise SystemExit("no model could be pulled")
print("using", MODEL, flush=True)

REPO = Path("/kaggle/working/repo")
OUT = Path("/kaggle/working/generated")
OUT.mkdir(exist_ok=True)
curriculum = json.loads((REPO / "content/curriculum.json").read_text(encoding="utf-8"))
existing_lessons = json.loads((REPO / "content/lessons_a1.json").read_text(encoding="utf-8"))
existing_units = {l["unit"] for l in existing_lessons}
example_lesson = next(l for l in existing_lessons if l["id"] == "a1-u3-l2")

LEVEL_GUIDE = {
    "A1": "Very short, high-frequency sentences (3-7 words). Present tense mostly. Explanations simple.",
    "A2": "Short everyday sentences (5-10 words). Perfekt, dative, modal verbs, simple subordinate clauses.",
    "B1": "Natural sentences of 8-15 words, connected speech, opinions, subordinate clauses, Präteritum in narration.",
    "B2": "Complex sentences of 12-22 words, formal and informal register, passive, Konjunktiv, nominal style. Speaking items can be 2-3 sentences.",
    "C1": "Idiomatic, nuanced native German. Modal particles, idioms, register shifts, long sentences. Speaking items are 2-4 sentences and sound like real native speech.",
}

STEP_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["intro", "phrase", "choice", "build", "listen", "speak", "match"]},
        "title": {"type": "string"},
        "body": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}},
        "table": {"type": "array", "items": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2}},
        "de": {"type": "string"},
        "en": {"type": "string"},
        "note": {"type": "string"},
        "prompt": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}},
        "answerIndex": {"type": "integer"},
        "explain": {"type": "string"},
        "tokens": {"type": "array", "items": {"type": "string"}},
        "distractors": {"type": "array", "items": {"type": "string"}},
        "pairs": {"type": "array", "items": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2}},
    },
    "required": ["type"],
}
UNIT_SCHEMA = {
    "type": "object",
    "properties": {
        "words": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "de": {"type": "string"},
                    "en": {"type": "string"},
                    "pos": {"type": "string", "enum": ["noun", "verb", "adj", "adv", "phrase", "prep", "conj", "pron", "num"]},
                    "gender": {"type": "string", "enum": ["m", "f", "n", "pl", ""]},
                    "plural": {"type": "string"},
                    "exDe": {"type": "string"},
                    "exEn": {"type": "string"},
                },
                "required": ["de", "en", "pos", "exDe", "exEn"],
            },
        },
        "lessons": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "steps": {"type": "array", "items": STEP_SCHEMA}},
                "required": ["title", "steps"],
            },
        },
        "paragraphs": {
            "type": "array",
            "items": {"type": "object", "properties": {"title": {"type": "string"}, "de": {"type": "string"}, "en": {"type": "string"}}, "required": ["title", "de", "en"]},
        },
    },
    "required": ["words", "lessons", "paragraphs"],
}


def example_for_prompt(lesson: dict) -> str:
    steps = []
    for s in lesson["steps"]:
        s = dict(s)
        if s["type"] == "choice":
            s["answerIndex"] = s.pop("answer")
        if s["type"] == "build":
            s["tokens"] = s.pop("answer")
            s["distractors"] = s.pop("extra")
        steps.append(s)
    return json.dumps({"title": lesson["title"], "steps": steps}, ensure_ascii=False)


def build_prompt(level: str, unit: dict, needs_words: bool) -> str:
    return f"""You are writing one unit of a German course for adult native English speakers. The app teaches standard German (Hochdeutsch) and pronunciation.

Level: {level}. {LEVEL_GUIDE[level]}
Unit: {unit['titleDe']} ({unit['title']})
Goal: {unit['goal']}
Grammar to teach: {'; '.join(unit['grammar'])}

Produce JSON with:
1. "words": {"20 vocabulary items for this unit's topic" if needs_words else "an empty list"}. Nouns need "gender" (m, f, n, or pl for plural-only) and "plural" (just the plural noun without article, empty if none). Other parts of speech use gender "". Each has a natural example sentence exDe with English exEn.
2. "lessons": exactly 3 lessons, building on each other, each with 8 to 10 steps. Use a mix: 1 "intro" (title, body, and either points or a 2-column table of German form and English meaning), 2 "phrase" (de, en, optional note), 2 "choice" (prompt, 3 options, answerIndex, explain), 1 "build" (en sentence, tokens = the German translation split into words in correct order with punctuation attached to the word before it, distractors = 2 wrong words), 1 "listen" (de, en, short enough to type), 1-2 "speak" (de, en), optionally 1 "match" (4 pairs of German and English).
3. "paragraphs": 2 short texts for reading aloud at this level, each with title, de, en.

Rules:
- Every German sentence must be grammatically perfect, natural, and something a native speaker would actually say.
- Explanations, prompts and English translations are in English. Teach the grammar point clearly with concrete examples.
- Choice distractors must be plausible mistakes a learner would make, and exactly one option is correct.
- Never use English words inside German sentences unless they are standard loanwords.

Here is an example lesson from level A1 showing the exact style and format:
{example_for_prompt(example_lesson)}

Return only the JSON."""


def ask(prompt: str) -> dict:
    for attempt in range(3):
        r = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={"model": MODEL, "prompt": prompt, "format": UNIT_SCHEMA, "stream": False, "options": {"temperature": 0.4, "num_ctx": 16384, "num_predict": 12000}},
            timeout=3600,
        )
        try:
            return json.loads(r.json()["response"])
        except Exception as exc:
            print("parse failure", attempt, exc, flush=True)
    raise RuntimeError("model never returned valid JSON")


nouns: dict[str, tuple[str, str]] = {}
try:
    raw = urllib.request.urlopen("https://raw.githubusercontent.com/gambolputty/german-nouns/main/german_nouns/nouns.csv", timeout=120).read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(raw))
    genus_cols = [c for c in reader.fieldnames if c.startswith("genus")]
    plural_cols = [c for c in reader.fieldnames if c.startswith("nominativ plural")]
    for row in reader:
        lemma = row.get("lemma", "").strip()
        genera = {row[c].strip() for c in genus_cols if row.get(c, "").strip()}
        if not lemma or len(genera) != 1 or lemma in nouns:
            continue
        g = genera.pop()
        plural = next((row[c].strip() for c in plural_cols if row.get(c, "").strip()), "")
        nouns[lemma] = ({"m": "m", "f": "f", "n": "n"}.get(g, ""), plural)
    print(f"{len(nouns)} reference nouns", flush=True)
except Exception as exc:
    print("noun reference unavailable:", exc, flush=True)

stats = Counter()


def check_words(words: list[dict]) -> list[dict]:
    out = []
    for w in words:
        if w["pos"] == "noun":
            stats["nouns"] += 1
            ref = nouns.get(w["de"])
            if ref is None:
                stats["nouns_unverified"] += 1
            else:
                g, pl = ref
                if g and w.get("gender") != g and w.get("gender") != "pl":
                    stats["gender_corrected"] += 1
                    w["gender"] = g
                if pl and w.get("plural") and w["plural"] != pl:
                    stats["plural_corrected"] += 1
                    w["plural"] = pl
        item = {"de": w["de"], "en": w["en"], "pos": w["pos"], "ex": {"de": w["exDe"], "en": w["exEn"]}}
        if w["pos"] == "noun" and w.get("gender"):
            item["gender"] = w["gender"]
            if w.get("plural") and w["gender"] != "pl":
                item["plural"] = w["plural"]
        out.append(item)
    return out


def convert_step(s: dict) -> dict | None:
    t = s.get("type")
    try:
        if t == "intro":
            step = {"type": "intro", "title": s["title"], "body": s["body"]}
            if s.get("points"):
                step["points"] = s["points"]
            if s.get("table"):
                step["table"] = [r[:2] for r in s["table"] if len(r) >= 2]
            return step
        if t in ("phrase", "listen", "speak"):
            step = {"type": t, "de": s["de"].strip(), "en": s["en"].strip()}
            if t == "phrase" and s.get("note"):
                step["note"] = s["note"]
            return step if step["de"] else None
        if t == "choice":
            opts = s["options"]
            idx = int(s["answerIndex"])
            if len(opts) < 2 or not 0 <= idx < len(opts) or len(set(opts)) != len(opts):
                return None
            step = {"type": "choice", "prompt": s["prompt"], "options": opts, "answer": idx}
            if s.get("explain"):
                step["explain"] = s["explain"]
            return step
        if t == "build":
            tokens = [x for x in s["tokens"] if x.strip()]
            extra = [x for x in s.get("distractors", []) if x.strip() and x not in tokens][:3]
            return {"type": "build", "en": s["en"], "answer": tokens, "extra": extra} if len(tokens) >= 2 else None
        if t == "match":
            pairs = [p[:2] for p in s["pairs"] if len(p) >= 2][:5]
            return {"type": "match", "pairs": pairs} if len(pairs) >= 3 and len({p[0] for p in pairs}) == len(pairs) else None
    except (KeyError, TypeError, ValueError):
        return None
    return None


tool = None
try:
    import language_tool_python

    tool = language_tool_python.LanguageTool("de-DE")
except Exception as exc:
    print("LanguageTool unavailable:", exc, flush=True)

IGNORE_RULES = {"WHITESPACE_RULE", "DE_CASE", "UPPERCASE_SENTENCE_START", "COMMA_PARENTHESIS_WHITESPACE", "GERMAN_SPELLER_RULE"}


def grammar_issues(text: str) -> list[str]:
    if tool is None:
        return []
    return [f"{m.ruleId}: {m.message}" for m in tool.check(text) if m.ruleId not in IGNORE_RULES]


def fix_sentence(text: str, issues: list[str]) -> str:
    r = requests.post(
        "http://127.0.0.1:11434/api/generate",
        json={
            "model": MODEL,
            "prompt": f"A German grammar checker flagged this sentence:\n{text}\nIssues: {'; '.join(issues)}\nIf the issue is real, return the corrected sentence. If the sentence is already correct, return it unchanged. Return only the sentence.",
            "stream": False,
            "options": {"temperature": 0},
        },
        timeout=600,
    )
    return r.json()["response"].strip().strip('"')


def review_german(unit_data: dict) -> None:
    targets = []
    for w in unit_data["words"]:
        targets.append(w["ex"])
    for l in unit_data["lessons"]:
        for s in l["steps"]:
            if "de" in s:
                targets.append(s)
    for p in unit_data["paragraphs"]:
        targets.append(p)
    for t in targets:
        stats["sentences"] += 1
        issues = grammar_issues(t["de"])
        if not issues:
            continue
        stats["sentences_flagged"] += 1
        fixed = fix_sentence(t["de"], issues)
        if fixed and fixed != t["de"] and not grammar_issues(fixed):
            stats["sentences_fixed"] += 1
            t["de"] = fixed
        else:
            stats["sentences_left_flagged"] += 1
            t.setdefault("_flags", issues)


def process(level: str, unit: dict) -> None:
    path = OUT / f"{unit['id']}.json"
    if path.exists():
        return
    needs_words = not unit["decks"]
    started = time.time()
    raw = ask(build_prompt(level, unit, needs_words))
    lessons = []
    for i, l in enumerate(raw.get("lessons", [])[:3], 1):
        steps = [c for c in (convert_step(s) for s in l.get("steps", [])) if c]
        stats["steps_dropped"] += len(l.get("steps", [])) - len(steps)
        if len(steps) >= 5:
            lessons.append({"id": f"{unit['id']}-l{i}", "unit": unit["id"], "title": l["title"], "steps": steps})
    data = {
        "unit": unit["id"],
        "level": level,
        "words": check_words(raw.get("words", [])) if needs_words else [],
        "lessons": lessons,
        "paragraphs": [{"id": f"p-{unit['id']}-{i}", "level": level, "title": p["title"], "de": p["de"], "en": p["en"]} for i, p in enumerate(raw.get("paragraphs", [])[:2], 1)],
    }
    review_german(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{unit['id']}: {len(lessons)} lessons, {len(data['words'])} words in {time.time() - started:.0f}s", flush=True)


jobs = [(lvl["id"], u) for lvl in curriculum["levels"] for u in lvl["units"] if u["id"] not in existing_units]
print(f"{len(jobs)} units to write", flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    for f in [pool.submit(process, lvl, u) for lvl, u in jobs]:
        try:
            f.result()
        except Exception as exc:
            print("unit failed:", exc, flush=True)

(OUT / "_stats.json").write_text(json.dumps({"model": MODEL, **stats}, indent=1), encoding="utf-8")
print(json.dumps({"model": MODEL, **stats}), flush=True)
server.terminate()
subprocess.run(["rm", "-rf", str(REPO)], check=True)
