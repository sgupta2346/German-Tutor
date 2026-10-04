import io
import json
import os
import re
import subprocess
import sys
import time
import wave

subprocess.run(
    [sys.executable, "-m", "pip", "install", "-q", "onnxruntime", "phonemizer", "espeakng-loader", "piper-tts", "soundfile", "huggingface_hub", "pyarrow"],
    check=True,
)
subprocess.run(["git", "clone", "--depth", "1", "https://github.com/sgupta2346/German-Tutor.git", "/kaggle/working/repo"], check=True)
sys.path.insert(0, "/kaggle/working/repo/server")

import espeakng_loader
import numpy as np
import onnxruntime as ort
import pyarrow.parquet as pq
import soundfile as sf
from huggingface_hub import hf_hub_download
from phonemizer import phonemize
from phonemizer.backend.espeak.wrapper import EspeakWrapper
from phonemizer.separator import Separator

EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())

from app.align import align
from app.phones import split_sequence
from app.scoring import score_attempt, tokenize

OUT = "/kaggle/working"
MODEL_REPO = "qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX"
VARIANTS = {"fp32": "onnx/model.onnx", "fp16": "onnx/model_fp16.onnx", "q4": "onnx/model_q4.onnx"}
N_NATIVE = int(os.environ.get("N_NATIVE", "120"))
RATE = 16000

vocab = json.load(open(hf_hub_download(MODEL_REPO, "vocab.json")))
id_to_token = {v: k for k, v in vocab.items()}
special = {"<pad>", "<s>", "</s>", "<unk>", "|"}
pad_id = vocab.get("<pad>", 0)

word_cache: dict[str, list[str]] = {}


def ref_phones(word: str) -> list[str]:
    if word not in word_cache:
        out = phonemize(word, language="de", backend="espeak", separator=Separator(phone=" ", word="", syllable=""), strip=True, with_stress=False)
        word_cache[word] = split_sequence(out)
    return word_cache[word]


def resample(audio: np.ndarray, rate: int) -> np.ndarray:
    if rate == RATE:
        return audio.astype(np.float32)
    duration = len(audio) / rate
    n = int(round(duration * RATE))
    return np.interp(np.linspace(0, duration, n, endpoint=False), np.linspace(0, duration, len(audio), endpoint=False), audio).astype(np.float32)


def decode(session: ort.InferenceSession, audio: np.ndarray) -> list[str]:
    x = (audio - audio.mean()) / np.sqrt(audio.var() + 1e-7)
    input_name = session.get_inputs()[0].name
    dtype = np.float16 if "float16" in session.get_inputs()[0].type else np.float32
    logits = session.run(None, {input_name: x[None, :].astype(dtype)})[0][0]
    ids = logits.argmax(-1)
    phones, prev = [], None
    for i in ids:
        if i != prev and i != pad_id:
            tok = id_to_token.get(int(i), "")
            if tok not in special:
                phones.append(tok)
        prev = i
    return split_sequence(" ".join(phones))


def per(ref: list[str], hyp: list[str]) -> float:
    ops = align(ref, hyp)
    errors = sum(1 for o in ops if o.kind != "match")
    return errors / max(1, len(ref))


def score_text(session, audio: np.ndarray, text: str) -> dict:
    words = tokenize(text)
    ref = [ref_phones(w) for w in words]
    hyp = decode(session, audio)
    result = score_attempt(words, ref, hyp, None)
    flat = [p for r in ref for p in r]
    result["per"] = per(flat, hyp)
    result["flagged_words"] = sum(1 for w in result["words"] if any(i["rule"] for i in w["issues"]))
    result["n_words"] = len(words)
    return result


print("loading native German speech (MLS 1h subset)")
table = pq.read_table(hf_hub_download("facebook/multilingual_librispeech", "german/1_hours-00000-of-00001.parquet", repo_type="dataset"))
rows = table.slice(0, N_NATIVE).to_pylist()
native = []
for r in rows:
    audio_field = r["audio"]
    data, rate = sf.read(io.BytesIO(audio_field["bytes"]), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    text = r.get("transcript") or r.get("text")
    native.append((resample(data, rate), re.sub(r"\s+", " ", text).strip()))
total_audio = sum(len(a) for a, _ in native) / RATE
print(f"{len(native)} utterances, {total_audio / 60:.1f} minutes")

content = json.load(open("/kaggle/working/repo/content/lessons_a1.json", encoding="utf-8"))
vocab_decks = json.load(open("/kaggle/working/repo/content/vocab_a1.json", encoding="utf-8"))
sentences = [s["de"] for l in content for s in l["steps"] if s["type"] in ("speak", "phrase", "listen") and len(s["de"].split()) >= 2]
sentences += [w["ex"]["de"] for d in vocab_decks for w in d["words"]][:40]
sentences = list(dict.fromkeys(sentences))[:60]

print("synthesising German and English-voiced readings with Piper")
voices = {}
for key, path in {"de": "de/de_DE/thorsten/medium/de_DE-thorsten-medium", "en": "en/en_US/lessac/medium/en_US-lessac-medium"}.items():
    onnx_path = hf_hub_download("rhasspy/piper-voices", f"{path}.onnx")
    hf_hub_download("rhasspy/piper-voices", f"{path}.onnx.json")
    from piper import PiperVoice

    voices[key] = PiperVoice.load(onnx_path)


def synth(voice, text: str) -> np.ndarray:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, wf)
        else:
            voice.synthesize(text, wf)
    buf.seek(0)
    data, rate = sf.read(buf, dtype="float32")
    return resample(data, rate)


tts = {k: [(synth(v, s), s) for s in sentences] for k, v in voices.items()}

results = {"native": {}, "tts_de": {}, "tts_en": {}, "speed": {}}
opts = ort.SessionOptions()
opts.intra_op_num_threads = os.cpu_count() or 2
for name, file in VARIANTS.items():
    path = hf_hub_download(MODEL_REPO, file)
    try:
        session = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
    except Exception as exc:
        print(f"{name}: failed to load ({exc})")
        results["native"][name] = {"error": str(exc)}
        continue
    started = time.perf_counter()
    scored = [score_text(session, a, t) for a, t in native]
    elapsed = time.perf_counter() - started
    results["speed"][name] = {"seconds_per_audio_second": elapsed / total_audio, "size_mb": os.path.getsize(path) / 1e6}
    results["native"][name] = {
        "per_mean": float(np.mean([s["per"] for s in scored])),
        "per_median": float(np.median([s["per"] for s in scored])),
        "score_mean": float(np.mean([s["score"] for s in scored])),
        "flagged_word_rate": sum(s["flagged_words"] for s in scored) / sum(s["n_words"] for s in scored),
        "rule_counts": {},
    }
    for s in scored:
        for f in s["focus"]:
            results["native"][name]["rule_counts"][f["rule"]] = results["native"][name]["rule_counts"].get(f["rule"], 0) + f["count"]
    for k in ("de", "en"):
        sc = [score_text(session, a, t) for a, t in tts[k]]
        counts: dict[str, int] = {}
        for s in sc:
            for f in s["focus"]:
                counts[f["rule"]] = counts.get(f["rule"], 0) + f["count"]
        results[f"tts_{k}"][name] = {
            "score_mean": float(np.mean([s["score"] for s in sc])),
            "per_mean": float(np.mean([s["per"] for s in sc])),
            "flagged_word_rate": sum(s["flagged_words"] for s in sc) / sum(s["n_words"] for s in sc),
            "rule_counts": dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        }
    print(name, json.dumps({k: results[k][name] for k in ("native", "tts_de", "tts_en")}, ensure_ascii=False)[:600])
    print(name, "speed", results["speed"][name])

example = native[0]
s0 = ort.InferenceSession(hf_hub_download(MODEL_REPO, VARIANTS["fp32"]), opts, providers=["CPUExecutionProvider"])
results["example"] = {"text": example[1], "ref": [ref_phones(w) for w in tokenize(example[1])], "hyp": decode(s0, example[0])}
results["n_native"] = len(native)
results["native_minutes"] = total_audio / 60
results["n_sentences"] = len(sentences)
json.dump(results, open(f"{OUT}/results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("done")
