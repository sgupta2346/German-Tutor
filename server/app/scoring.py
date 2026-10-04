import re
from collections import Counter

from .align import align
from .diagnose import diagnose

SYLLABIC = {"n", "l", "m"}
ELISION_COST = 0.2

WORD_RE = re.compile(r"[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*")


def tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text)


def normalize_word(word: str) -> str:
    return word.lower().replace("ß", "ss")


def word_matches(expected: list[str], heard: list[str]) -> list[bool]:
    pool = Counter(normalize_word(w) for w in heard)
    result = []
    for word in expected:
        key = normalize_word(word)
        if pool[key] > 0:
            pool[key] -= 1
            result.append(True)
        else:
            result.append(False)
    return result


def score_attempt(words: list[str], ref_phones: list[list[str]], hyp_phones: list[str], transcript: str | None) -> dict:
    flat_ref: list[str] = []
    word_of: list[int] = []
    for w, phones in enumerate(ref_phones):
        flat_ref.extend(phones)
        word_of.extend([w] * len(phones))

    delete_costs = []
    for k, phone in enumerate(flat_ref):
        nxt = flat_ref[k + 1] if k + 1 < len(flat_ref) and word_of[k + 1] == word_of[k] else None
        delete_costs.append(ELISION_COST if phone == "ə" and nxt in SYLLABIC else 1.0)
    ops = align(flat_ref, hyp_phones, delete_costs)
    issues = diagnose(ops, word_of)

    penalty = [0.0] * len(words)
    for op in ops:
        if op.kind == "match" or op.ref_index is None or not (0 <= op.ref_index < len(word_of)):
            continue
        penalty[word_of[op.ref_index]] += op.cost

    heard_words = tokenize(transcript or "")
    understood = word_matches(words, heard_words) if transcript is not None else [None] * len(words)

    word_results = []
    for i, word in enumerate(words):
        size = max(len(ref_phones[i]), 1)
        accuracy = max(0.0, 1.0 - penalty[i] / size)
        word_results.append({
            "word": word,
            "accuracy": round(accuracy, 3),
            "understood": understood[i],
            "expected": ref_phones[i],
            "issues": [x for x in issues if x["word"] == i],
        })

    total_ref = max(len(flat_ref), 1)
    total_penalty = sum(penalty)
    phone_accuracy = max(0.0, 1.0 - total_penalty / total_ref)
    known = [u for u in understood if u is not None]
    intelligibility = sum(known) / len(known) if known else None
    overall = phone_accuracy if intelligibility is None else 0.75 * phone_accuracy + 0.25 * intelligibility

    rules = Counter(x["rule"] for x in issues if x["rule"])
    return {
        "score": round(100 * overall),
        "phoneAccuracy": round(phone_accuracy, 3),
        "intelligibility": None if intelligibility is None else round(intelligibility, 3),
        "transcript": transcript,
        "heardPhones": hyp_phones,
        "words": word_results,
        "focus": [{"rule": r, "count": c} for r, c in rules.most_common()],
    }
