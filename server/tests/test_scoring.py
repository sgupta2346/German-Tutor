from app.align import align
from app.scoring import score_attempt, tokenize, word_matches


def rules(result):
    return [i["rule"] for w in result["words"] for i in w["issues"]]


def test_perfect_attempt_scores_full():
    ref = [["ɡ", "uː", "t", "ə", "n"], ["t", "aː", "k"]]
    hyp = ["ɡ", "uː", "t", "ə", "n", "t", "aː", "k"]
    result = score_attempt(["Guten", "Tag"], ref, hyp, "Guten Tag")
    assert result["score"] == 100
    assert rules(result) == []


def test_equivalent_r_variants_are_not_errors():
    ref = [["ʁ", "oː", "t"]]
    hyp = ["ʀ", "oː", "t"]
    result = score_attempt(["rot"], ref, hyp, None)
    assert result["phoneAccuracy"] == 1.0


def test_english_r_is_flagged():
    result = score_attempt(["rot"], [["ʁ", "oː", "t"]], ["ɹ", "oː", "t"], None)
    assert "r" in rules(result)


def test_ue_said_as_oo():
    result = score_attempt(["Tür"], [["t", "yː", "ɐ"]], ["t", "uː", "ɐ"], None)
    assert "ue" in rules(result)
    assert result["words"][0]["accuracy"] < 1.0


def test_ich_said_as_ish():
    result = score_attempt(["ich"], [["ɪ", "ç"]], ["ɪ", "ʃ"], None)
    assert rules(result) == ["ich"]


def test_final_ig_said_as_k():
    result = score_attempt(["richtig"], [["ʁ", "ɪ", "ç", "t", "ɪ", "ç"]], ["ʁ", "ɪ", "ç", "t", "ɪ", "k"], None)
    assert rules(result) == ["ig"]


def test_ach_said_as_k():
    result = score_attempt(["Nacht"], [["n", "a", "x", "t"]], ["n", "a", "k", "t"], None)
    assert rules(result) == ["ach"]


def test_final_devoicing_missed():
    result = score_attempt(["Hund"], [["h", "ʊ", "n", "t"]], ["h", "ʊ", "n", "d"], None)
    assert rules(result) == ["devoicing"]


def test_w_said_as_english_w():
    result = score_attempt(["Wasser"], [["v", "a", "s", "ɐ"]], ["w", "a", "s", "ɐ"], None)
    assert rules(result) == ["w"]


def test_z_said_as_english_z():
    result = score_attempt(["Zeit"], [["ts", "aɪ", "t"]], ["z", "aɪ", "t"], None)
    assert rules(result) == ["z"]


def test_dropped_final_schwa():
    result = score_attempt(["bitte"], [["b", "ɪ", "t", "ə"]], ["b", "ɪ", "t"], None)
    assert rules(result) == ["schwa"]


def test_vowel_length():
    result = score_attempt(["Staat"], [["ʃ", "t", "aː", "t"]], ["ʃ", "t", "a", "t"], None)
    assert rules(result) == ["length"]


def test_errors_attach_to_the_right_word():
    ref = [["ɪ", "ç"], ["b", "ɪ", "n"], ["m", "yː", "d", "ə"]]
    hyp = ["ɪ", "ç", "b", "ɪ", "n", "m", "uː", "d", "ə"]
    result = score_attempt(["Ich", "bin", "müde"], ref, hyp, None)
    assert [len(w["issues"]) for w in result["words"]] == [0, 0, 1]
    assert result["words"][2]["issues"][0]["rule"] == "ue"


def test_intelligibility_uses_transcript():
    ref = [["d", "aŋ", "k", "ə"]]
    result = score_attempt(["Danke"], ref, ["d", "a", "ŋ", "k", "ə"], "Tanke.")
    assert result["intelligibility"] == 0.0
    assert result["words"][0]["understood"] is False


def test_word_matching_handles_case_and_eszett():
    assert word_matches(["Straße", "gut"], ["strasse", "Gut"]) == [True, True]


def test_tokenize_keeps_umlauts_and_hyphens():
    assert tokenize("Grüß dich, U-Bahn!") == ["Grüß", "dich", "U-Bahn"]


def test_alignment_handles_empty_hypothesis():
    ops = align(["a", "b"], [])
    assert [o.kind for o in ops] == ["del", "del"]


def test_espeak_r_notation_accepts_uvular_and_flags_english():
    assert score_attempt(["Tür"], [["t", "yː", "ɾ"]], ["t", "yː", "ʁ"], None)["phoneAccuracy"] == 1.0
    assert rules(score_attempt(["rot"], [["r", "oː", "t"]], ["ɹ", "oː", "t"], None)) == ["r"]


def test_espeak_vocalic_r_with_english_r():
    assert rules(score_attempt(["Mutter"], [["m", "ʊ", "t", "ɜ"]], ["m", "ʊ", "t", "ɚ"], None)) == ["er"]


def test_long_a_variants_match():
    assert score_attempt(["Tag"], [["t", "ɑː", "k"]], ["t", "aː", "k"], None)["phoneAccuracy"] == 1.0
