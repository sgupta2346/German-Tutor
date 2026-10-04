import unicodedata

STRIP = {"ˈ", "ˌ", "‿", "͡", "̯", "̩", "-", "."}

VOWELS = set("aeiouyæøœɐɑɒɔəɛɜɪʊʏʌɨɵɯɤ")

GROUPS = [
    {"y", "ʏ", "u", "ʊ", "i", "ɪ"},
    {"ø", "œ", "o", "ɔ", "e", "ɛ", "ə", "ɜ"},
    {"a", "ɑ", "æ", "ɐ", "ʌ", "ə", "ɜ"},
    {"ç", "ʃ", "x", "χ", "h", "k", "s"},
    {"ʁ", "r", "ɾ", "ɹ", "ʀ", "χ", "ɻ"},
    {"v", "w", "f", "b"},
    {"s", "z", "ʃ", "ʒ"},
    {"p", "b"}, {"t", "d"}, {"k", "ɡ", "g"},
    {"m", "n", "ŋ"},
    {"l", "ɫ"},
]

EQUIVALENT = [
    {"ʁ", "ʀ", "χ", "r", "ɾ"},
    {"ɐ", "ɐ̯", "ɜ"},
    {"a", "ɑ"},
    {"aː", "ɑː"},
    {"ɡ", "g"},
    {"l", "ɫ"},
]


def clean(phone: str) -> str:
    phone = unicodedata.normalize("NFC", phone)
    return "".join(ch for ch in phone if ch not in STRIP)


def base(phone: str) -> str:
    return phone.replace("ː", "").replace("ˑ", "").replace("ɑ", "a")


def is_long(phone: str) -> bool:
    return "ː" in phone


def is_vowel(phone: str) -> bool:
    return bool(phone) and phone[0] in VOWELS


def equivalent(a: str, b: str) -> bool:
    if a == b:
        return True
    return any(a in group and b in group for group in EQUIVALENT)


def substitution_cost(ref: str, hyp: str) -> float:
    if equivalent(ref, hyp):
        return 0.0
    if base(ref) == base(hyp):
        return 0.15
    if any(base(ref) in g and base(hyp) in g for g in GROUPS):
        return 0.7
    if is_vowel(ref) != is_vowel(hyp):
        return 1.2
    return 1.0


def split_sequence(text: str) -> list[str]:
    return [clean(p) for p in text.split() if clean(p)]
