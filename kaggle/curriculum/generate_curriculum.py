import csv
import io
import json
import os
import random
import re
import subprocess
import sys
import threading
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
RAW = Path("/kaggle/working/raw")
OUT.mkdir(exist_ok=True)
RAW.mkdir(exist_ok=True)
curriculum = json.loads((REPO / "content/curriculum.json").read_text(encoding="utf-8"))
existing_units = {l["unit"] for l in json.loads((REPO / "content/lessons_a1.json").read_text(encoding="utf-8"))}

LEVEL_GUIDE = {
    "A1": "Very short, high-frequency sentences of 3 to 7 words, mostly present tense.",
    "A2": "Everyday sentences of 5 to 10 words using Perfekt, dative, modal verbs and simple weil/dass clauses.",
    "B1": "Natural sentences of 8 to 15 words with subordinate clauses, opinions and connectors, the way people really talk.",
    "B2": "Complex sentences of 12 to 22 words, formal and informal register, passive, Konjunktiv, nominal style.",
    "C1": "Idiomatic, nuanced native German of 15 to 30 words: modal particles, idioms, register shifts.",
}

S = {"type": "string"}
PAIR = {"type": "array", "items": S, "minItems": 2, "maxItems": 2}
CHOICE = {"type": "object", "properties": {"prompt": S, "options": {"type": "array", "items": S, "minItems": 3, "maxItems": 3}, "correct": S, "explain": S}, "required": ["prompt", "options", "correct", "explain"]}
SENT = {"type": "object", "properties": {"de": S, "en": S}, "required": ["de", "en"]}
LESSON_SCHEMA = {
    "type": "object",
    "properties": {
        "title": S,
        "intro": {"type": "object", "properties": {"title": S, "body": S, "table": {"type": "array", "items": PAIR, "minItems": 3, "maxItems": 8}}, "required": ["title", "body", "table"]},
        "phrases": {"type": "array", "items": {"type": "object", "properties": {"de": S, "en": S, "note": S}, "required": ["de", "en"]}, "minItems": 2, "maxItems": 3},
        "choices": {"type": "array", "items": CHOICE, "minItems": 2, "maxItems": 3},
        "build": SENT,
        "listen": SENT,
        "speak": {"type": "array", "items": SENT, "minItems": 1, "maxItems": 2},
        "match": {"type": "array", "items": PAIR, "minItems": 4, "maxItems": 4},
    },
    "required": ["title", "intro", "phrases", "choices", "build", "listen", "speak", "match"],
}
WORDS_SCHEMA = {
    "type": "object",
    "properties": {
        "words": {
            "type": "array",
            "minItems": 18,
            "maxItems": 22,
            "items": {
                "type": "object",
                "properties": {
                    "word": S,
                    "en": S,
                    "pos": {"type": "string", "enum": ["noun", "verb", "adj", "adv", "phrase", "prep", "conj", "pron", "num"]},
                    "article": {"type": "string", "enum": ["der", "die", "das", "die (plural only)", "none"]},
                    "plural": S,
                    "exDe": S,
                    "exEn": S,
                },
                "required": ["word", "en", "pos", "article", "plural", "exDe", "exEn"],
            },
        }
    },
    "required": ["words"],
}
PARA_SCHEMA = {"type": "object", "properties": {"texts": {"type": "array", "items": {"type": "object", "properties": {"title": S, "de": S, "en": S}, "required": ["title", "de", "en"]}, "minItems": 2, "maxItems": 2}}, "required": ["texts"]}


def ask(prompt: str, schema: dict, tag: str) -> dict:
    for attempt in range(3):
        r = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={"model": MODEL, "prompt": prompt, "format": schema, "stream": False, "options": {"temperature": 0.5, "num_ctx": 8192, "num_predict": 6000}},
            timeout=3600,
        )
        text = r.json().get("response", "")
        (RAW / f"{tag}-{attempt}.txt").write_text(text, encoding="utf-8")
        try:
            return json.loads(text)
        except Exception as exc:
            print(tag, "parse failure", attempt, exc, flush=True)
    raise RuntimeError(f"{tag}: no valid JSON")


def unit_context(level: str, unit: dict) -> str:
    return f"""You are writing a German course for adult native English speakers who want to speak standard German (Hochdeutsch) fluently.
Level: {level}. {LEVEL_GUIDE[level]}
Unit: {unit['titleDe']} ({unit['title']}). Goal: {unit['goal']}
Grammar of this unit: {'; '.join(unit['grammar'])}"""


RULES = """Rules:
- Every German sentence must be grammatically perfect, natural, and something a native speaker would actually say.
- Explanations and translations are in English.
- Never mix English words into German sentences unless they are standard loanwords."""


def lesson_prompt(level: str, unit: dict, n: int, previous: list[str]) -> str:
    focus = unit["grammar"][(n - 1) % len(unit["grammar"])]
    return f"""{unit_context(level, unit)}

Write lesson {n} of 3. Its main focus: {focus}. {('Earlier lessons in this unit covered: ' + '; '.join(previous) + '. Do not repeat them, build on them.') if previous else ''}

Fill these fields:
- title: short English lesson title.
- intro: title, a body of 3 to 5 sentences that actually teaches the grammar point with a clear rule and how it differs from English, and a table of 3 to 8 rows pairing a German example or form with its English meaning.
- phrases: 2 to 3 useful German sentences for this lesson with English translations, and an optional pronunciation or usage note.
- choices: 2 to 3 multiple-choice questions testing the grammar point. Each has exactly 3 options, "correct" must be copied exactly from one of the options, the other two must be plausible learner mistakes, and "explain" says why the answer is right.
- build: one sentence for the learner to assemble, German de and English en.
- listen: one German sentence for dictation, short enough to type.
- speak: 1 to 2 German sentences to say aloud.
- match: 4 pairs of a German word or phrase and its English meaning.

{RULES}"""


def words_prompt(level: str, unit: dict) -> str:
    return f"""{unit_context(level, unit)}

List 20 vocabulary items a learner needs for this unit's topic, mostly nouns, verbs and adjectives.
- word: the German word on its own, with no article.
- article: der, die or das for nouns, "die (plural only)" for plural-only nouns, "none" for everything else.
- plural: the full plural form of a noun without article (e.g. Häuser), or "" if it has none or is not a noun.
- exDe and exEn: a natural example sentence and its translation.

{RULES}"""


def paragraphs_prompt(level: str, unit: dict) -> str:
    return f"""{unit_context(level, unit)}

Write 2 short texts to read aloud for pronunciation practice on this unit's topic. At this level each text should be {'3 to 4 short sentences' if level in ('A1', 'A2') else '4 to 6 sentences'}. Give a short English title, the German text de and its English translation en.

{RULES}"""


ARTICLES = {"der": "m", "die": "f", "das": "n", "die (plural only)": "pl"}
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
        plural = next((row[c].strip() for c in plural_cols if row.get(c, "").strip()), "")
        nouns[lemma] = ({"m": "m", "f": "f", "n": "n"}.get(genera.pop(), ""), plural)
    print(f"{len(nouns)} reference nouns", flush=True)
except Exception as exc:
    print("noun reference unavailable:", exc, flush=True)

stats = Counter()
lock = threading.Lock()


def bump(key: str, n: int = 1) -> None:
    with lock:
        stats[key] += n


def strip_article(word: str) -> str:
    return re.sub(r"^(der|die|das)\s+", "", word.strip())


def convert_words(raw_words: list[dict]) -> list[dict]:
    out, seen = [], set()
    for w in raw_words:
        de = strip_article(w["word"])
        if not de or de in seen:
            continue
        seen.add(de)
        item = {"de": de, "en": w["en"].strip(), "pos": w["pos"], "ex": {"de": w["exDe"].strip(), "en": w["exEn"].strip()}}
        if w["pos"] == "noun":
            bump("nouns")
            gender = ARTICLES.get(w["article"], "")
            plural = strip_article(w.get("plural", ""))
            ref = nouns.get(de)
            if ref is None:
                bump("nouns_unverified")
            else:
                ref_gender, ref_plural = ref
                if ref_gender and gender != "pl" and gender != ref_gender:
                    bump("gender_corrected")
                    gender = ref_gender
                if ref_plural and plural != ref_plural:
                    if plural:
                        bump("plural_corrected")
                    else:
                        bump("plural_filled")
                    plural = ref_plural
            if gender:
                item["gender"] = gender
                if plural and gender != "pl" and len(plural) > 3:
                    item["plural"] = plural
        out.append(item)
    return out


def tokens(sentence: str) -> list[str]:
    return sentence.split()


def convert_lesson(raw: dict, lesson_id: str, unit_id: str) -> dict:
    steps: list[dict] = []
    intro = raw["intro"]
    steps.append({"type": "intro", "title": intro["title"], "body": intro["body"], "table": [r[:2] for r in intro["table"] if len(r) >= 2]})
    for p in raw["phrases"]:
        s = {"type": "phrase", "de": p["de"].strip(), "en": p["en"].strip()}
        if p.get("note"):
            s["note"] = p["note"]
        steps.append(s)
    for c in raw["choices"]:
        opts = [o.strip() for o in c["options"]]
        correct = c["correct"].strip()
        if correct not in opts or len(set(opts)) != len(opts):
            bump("choices_dropped")
            continue
        steps.append({"type": "choice", "prompt": c["prompt"], "options": opts, "answer": opts.index(correct), "explain": c["explain"]})
    match = [p[:2] for p in raw["match"] if len(p) >= 2]
    if len({p[0] for p in match}) == len(match) >= 3:
        steps.append({"type": "match", "pairs": match})
    words = tokens(raw["build"]["de"])
    bare = {w.strip(".,!?") for w in words}
    pool = [w.strip(".,!?") for s in steps if "de" in s for w in tokens(s["de"]) if w.strip(".,!?") and w.strip(".,!?") not in bare]
    random.shuffle(pool)
    steps.append({"type": "build", "en": raw["build"]["en"], "answer": words, "extra": list(dict.fromkeys(pool))[:2]})
    steps.append({"type": "listen", "de": raw["listen"]["de"].strip(), "en": raw["listen"]["en"].strip()})
    for s in raw["speak"]:
        steps.append({"type": "speak", "de": s["de"].strip(), "en": s["en"].strip()})
    order = {"intro": 0, "phrase": 1, "choice": 2, "match": 3, "build": 4, "listen": 5, "speak": 6}
    head, rest = steps[:1], steps[1:]
    rest.sort(key=lambda s: order[s["type"]])
    return {"id": lesson_id, "unit": unit_id, "title": raw["title"], "steps": head + rest}


tool = None
try:
    import language_tool_python

    tool = language_tool_python.LanguageTool("de-DE")
except Exception as exc:
    print("LanguageTool unavailable:", exc, flush=True)

IGNORE_RULES = {"WHITESPACE_RULE", "DE_CASE", "UPPERCASE_SENTENCE_START", "COMMA_PARENTHESIS_WHITESPACE", "GERMAN_SPELLER_RULE", "DE_DOUBLE_PUNCTUATION"}


def rule_of(m) -> str:
    return getattr(m, "rule_id", None) or getattr(m, "ruleId", "") or ""


def grammar_issues(text: str) -> list[str]:
    if tool is None:
        return []
    with lock:
        matches = tool.check(text)
    return [f"{rule_of(m)}: {m.message}" for m in matches if rule_of(m) not in IGNORE_RULES]


def fix_sentence(text: str, issues: list[str]) -> str:
    r = requests.post(
        "http://127.0.0.1:11434/api/generate",
        json={
            "model": MODEL,
            "prompt": f"A German grammar checker flagged this sentence:\n{text}\nIssues: {'; '.join(issues)}\nIf the issue is real, return the corrected sentence. If the sentence is already correct, return it unchanged. Return only the sentence, nothing else.",
            "stream": False,
            "options": {"temperature": 0},
        },
        timeout=600,
    )
    return r.json()["response"].strip().strip('"').splitlines()[0].strip()


flagged_log: list[dict] = []


def review(unit_id: str, item: dict, key: str = "de") -> None:
    bump("sentences")
    issues = grammar_issues(item[key])
    if not issues:
        return
    bump("sentences_flagged")
    fixed = fix_sentence(item[key], issues)
    if fixed and fixed != item[key] and not grammar_issues(fixed):
        bump("sentences_fixed")
        with lock:
            flagged_log.append({"unit": unit_id, "before": item[key], "after": fixed, "issues": issues})
        item[key] = fixed
    else:
        bump("sentences_kept")
        with lock:
            flagged_log.append({"unit": unit_id, "kept": item[key], "issues": issues})


def review_unit(data: dict) -> None:
    uid = data["unit"]
    for w in data["words"]:
        review(uid, w["ex"])
    for l in data["lessons"]:
        for s in l["steps"]:
            if "de" in s:
                review(uid, s)
            if s["type"] == "build":
                holder = {"de": " ".join(s["answer"])}
                review(uid, holder)
                s["answer"] = tokens(holder["de"])
    for p in data["paragraphs"]:
        review(uid, p)


def process(level: str, unit: dict) -> None:
    path = OUT / f"{unit['id']}.json"
    started = time.time()
    lessons, covered = [], []
    for n in (1, 2, 3):
        try:
            raw = ask(lesson_prompt(level, unit, n, covered), LESSON_SCHEMA, f"{unit['id']}-l{n}")
            lesson = convert_lesson(raw, f"{unit['id']}-l{n}", unit["id"])
            lessons.append(lesson)
            covered.append(f"{lesson['title']} ({raw['intro']['title']})")
        except Exception as exc:
            bump("lessons_failed")
            print(unit["id"], "lesson", n, "failed:", exc, flush=True)
    words = convert_words(ask(words_prompt(level, unit), WORDS_SCHEMA, f"{unit['id']}-words")["words"]) if not unit["decks"] else []
    texts = ask(paragraphs_prompt(level, unit), PARA_SCHEMA, f"{unit['id']}-texts")["texts"]
    data = {
        "unit": unit["id"],
        "level": level,
        "words": words,
        "lessons": lessons,
        "paragraphs": [{"id": f"p-{unit['id']}-{i}", "level": level, "title": p["title"], "de": p["de"].strip(), "en": p["en"].strip()} for i, p in enumerate(texts, 1)],
    }
    review_unit(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{unit['id']}: {len(lessons)} lessons, {sum(len(l['steps']) for l in lessons)} steps, {len(words)} words in {time.time() - started:.0f}s", flush=True)


jobs = [(lvl["id"], u) for lvl in curriculum["levels"] for u in lvl["units"] if u["id"] not in existing_units]
print(f"{len(jobs)} units to write", flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    for f in [pool.submit(process, lvl, u) for lvl, u in jobs]:
        try:
            f.result()
        except Exception as exc:
            bump("units_failed")
            print("unit failed:", repr(exc), flush=True)

(OUT / "_stats.json").write_text(json.dumps({"model": MODEL, **stats}, indent=1), encoding="utf-8")
(OUT / "_grammar_log.json").write_text(json.dumps(flagged_log, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({"model": MODEL, **stats}), flush=True)
server.terminate()
subprocess.run(["rm", "-rf", str(REPO)], check=True)
