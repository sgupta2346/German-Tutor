from .align import Op
from .phones import base, is_long, is_vowel

U_LIKE = {"u", "ʊ", "i", "ɪ", "ju"}
O_LIKE = {"o", "ɔ", "e", "ɛ", "ə", "ɜ", "oʊ"}
ENGLISH_R = {"ɹ", "ɻ", "ɾ", "ɚ", "ɝ"}
VOICED = {"p": "b", "t": "d", "k": "ɡ"}


def _rule_for_sub(ref: str, hyp: str, prev_ref: str | None, next_ref: str | None) -> str | None:
    r, h = base(ref), base(hyp)
    if r in {"y", "ʏ"} and h in U_LIKE:
        return "ue"
    if r in {"ø", "œ"} and h in O_LIKE:
        return "oe"
    if r == "ɛ" and h in {"a", "æ", "eɪ"}:
        return "ae"
    if r == "ç" and h in {"ʃ", "k", "ɡ", "h", "x"}:
        return "ig" if h in {"k", "ɡ"} and prev_ref == "ɪ" and next_ref is None else "ich"
    if r == "x" and h in {"k", "h"}:
        return "ach"
    if r == "ʁ" and h in ENGLISH_R:
        return "r"
    if r == "ɐ" and h in ENGLISH_R:
        return "er"
    if r == "ts" and h in {"z", "s", "dz"}:
        return "z"
    if r == "v" and h == "w":
        return "qu" if prev_ref == "k" else "w"
    if r == "f" and h == "v":
        return "v"
    if r == "z" and h == "s":
        return "s-voiced"
    if r == "ʃ" and h == "s" and next_ref in {"p", "t"}:
        return "sp-st"
    if r in VOICED and h == VOICED[r] and next_ref is None:
        return "devoicing"
    if r == "aɪ" and h in {"i", "iː"}:
        return "ei-ie"
    if base(r) == "i" and h == "aɪ":
        return "ei-ie"
    if r == "ɔʏ" and h in {"ju", "u", "juː"}:
        return "eu"
    if r == "aʊ" and h in {"ɔ", "ɑ"}:
        return "au"
    if r == "pf" and h == "f":
        return "pf"
    if is_vowel(ref) and base(ref) == base(hyp) and is_long(ref) != is_long(hyp):
        return "length"
    return None


def diagnose(ops: list[Op], word_of: list[int]) -> list[dict]:
    issues: list[dict] = []
    ref_seq = [op.ref for op in ops if op.ref is not None]

    def neighbours(index: int) -> tuple[str | None, str | None]:
        word = word_of[index]
        prev_ref = ref_seq[index - 1] if index > 0 and word_of[index - 1] == word else None
        next_ref = ref_seq[index + 1] if index + 1 < len(ref_seq) and word_of[index + 1] == word else None
        return prev_ref, next_ref

    for k, op in enumerate(ops):
        if op.kind == "match":
            continue
        rule = None
        word = None
        if op.kind == "sub" and op.ref_index is not None:
            prev_ref, next_ref = neighbours(op.ref_index)
            rule = _rule_for_sub(op.ref, op.hyp, prev_ref, next_ref)
            word = word_of[op.ref_index]
        elif op.kind == "del" and op.ref_index is not None:
            prev_ref, next_ref = neighbours(op.ref_index)
            word = word_of[op.ref_index]
            if op.ref == "ə" and next_ref is None:
                rule = "schwa"
            elif op.ref == "ʔ":
                rule = "glottal"
            elif op.ref == "p" and next_ref == "f":
                rule = "pf"
        elif op.kind == "ins":
            anchor = op.ref_index
            if anchor is not None and 0 <= anchor < len(ref_seq):
                word = word_of[anchor]
                if op.hyp == "ɡ" and ref_seq[anchor] == "ŋ":
                    rule = "ng"
                elif op.hyp in ENGLISH_R and ref_seq[anchor] in {"ɐ", "ɐ̯"}:
                    rule = "er"
        if op.cost < 0.5 and rule is None:
            continue
        issues.append({
            "kind": op.kind,
            "expected": op.ref,
            "heard": op.hyp,
            "word": word,
            "rule": rule,
            "position": k,
        })
    return issues
