import io
import json
import os
import subprocess
import sys
import time
import wave

os.environ["COQUI_TOS_AGREED"] = "1"
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "onnxruntime", "phonemizer", "espeakng-loader", "piper-tts", "soundfile", "huggingface_hub", "librosa", "coqui-tts"], check=True)
subprocess.run(["git", "clone", "--depth", "1", "https://github.com/sgupta2346/German-Tutor.git", "/kaggle/working/repo"], check=True)
sys.path.insert(0, "/kaggle/working/repo/server")

import espeakng_loader
import librosa
import numpy as np
import onnxruntime as ort
import soundfile as sf
from huggingface_hub import hf_hub_download
from phonemizer import phonemize
from phonemizer.backend.espeak.wrapper import EspeakWrapper
from phonemizer.separator import Separator

EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())

from app.align import align
from app.phones import split_sequence
from app.scoring import tokenize

RATE = 16000
TESTS = [
    ("ich", "ç"), ("nicht", "ç"), ("Milch", "ç"), ("richtig", "ç"), ("mich", "ç"), ("das Mädchen", "ç"),
    ("acht", "x"), ("das Buch", "x"), ("noch", "x"), ("auch", "x"),
    ("über", "y"), ("die Tür", "y"), ("fünf", "y"), ("müde", "y"),
    ("schön", "ø"), ("hören", "ø"), ("zwölf", "œ"),
    ("rot", "R"), ("das Brot", "R"), ("die Frau", "R"),
    ("die Zeit", "ts"), ("zehn", "ts"), ("das Wasser", "v"), ("wie", "v"),
    ("der Käse", "ɛ"), ("spät", "ɛ"),
    ("Ich bin Anna.", None), ("Ich heiße Lisa und komme aus Hamburg.", None), ("Ich bin Lehrerin.", None),
    ("Guten Morgen, wie geht es Ihnen?", None), ("Ich möchte einen Kaffee mit Milch, bitte.", None),
    ("Meine Schwester wohnt in München.", None), ("Entschuldigung, wo ist der Bahnhof?", None),
    ("Das Wetter ist heute wirklich schön.", None), ("Wir fahren am Wochenende nach Österreich.", None),
]
R_FAMILY = {"ʁ", "r", "ɾ", "ʀ", "χ", "ɐ"}


def ref_phones(text: str) -> list[str]:
    out = []
    for w in tokenize(text):
        p = phonemize(w, language="de", backend="espeak", separator=Separator(phone=" ", word="", syllable=""), strip=True, with_stress=False)
        out += split_sequence(p)
    return out


MODEL_REPO = "qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX"
vocab = json.load(open(hf_hub_download(MODEL_REPO, "vocab.json")))
id_to_token = {v: k for k, v in vocab.items()}
pad_id = vocab.get("<pad>", 0)
session = ort.InferenceSession(hf_hub_download(MODEL_REPO, "onnx/model_q4.onnx"), providers=["CPUExecutionProvider"])


def heard(audio: np.ndarray) -> list[str]:
    x = (audio - audio.mean()) / np.sqrt(audio.var() + 1e-7)
    logits = session.run(None, {session.get_inputs()[0].name: x[None, :].astype(np.float32)})[0][0]
    out, prev = [], None
    for i in logits.argmax(-1):
        if i != prev and i != pad_id:
            tok = id_to_token.get(int(i), "")
            if tok not in {"<pad>", "<s>", "</s>", "<unk>", "|"}:
                out.append(tok)
        prev = i
    return split_sequence(" ".join(out))


def to16k(data: np.ndarray, rate: int) -> np.ndarray:
    if data.ndim > 1:
        data = data.mean(axis=1)
    return librosa.resample(data.astype(np.float32), orig_sr=rate, target_sr=RATE) if rate != RATE else data.astype(np.float32)


def pitch(audio: np.ndarray) -> float:
    f0, voiced, _ = librosa.pyin(audio, fmin=70, fmax=400, sr=RATE)
    f0 = f0[voiced] if voiced is not None else f0
    f0 = f0[~np.isnan(f0)]
    return float(np.median(f0)) if len(f0) else 0.0


def evaluate(name: str, synth) -> dict:
    hits, totals, pers, pitches, examples = 0, 0, [], [], {}
    started = time.time()
    for text, target in TESTS:
        try:
            audio = synth(text)
        except Exception as exc:
            print(name, "failed on", text, exc, flush=True)
            continue
        h = heard(audio)
        ref = ref_phones(text)
        ops = align(ref, h)
        pers.append(sum(1 for o in ops if o.kind != "match") / max(1, len(ref)))
        pitches.append(pitch(audio))
        if target:
            totals += 1
            ok = any(p in R_FAMILY for p in h) if target == "R" else any(p.startswith(target) for p in h)
            hits += ok
            examples[text] = " ".join(h)
    return {
        "voice": name,
        "target_sound_accuracy": hits / max(1, totals),
        "mean_per": float(np.mean(pers)) if pers else 1.0,
        "median_pitch_hz": float(np.median(pitches)) if pitches else 0.0,
        "seconds": round(time.time() - started),
        "heard": examples,
    }


results = []
from piper import PiperVoice


def piper_synth(path: str, speaker: int | None = None):
    onnx = hf_hub_download("rhasspy/piper-voices", f"{path}.onnx")
    hf_hub_download("rhasspy/piper-voices", f"{path}.onnx.json")
    voice = PiperVoice.load(onnx)

    def run(text: str) -> np.ndarray:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            if hasattr(voice, "synthesize_wav"):
                if speaker is None:
                    voice.synthesize_wav(text, wf)
                else:
                    from piper import SynthesisConfig

                    voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(speaker_id=speaker))
            else:
                voice.synthesize(text, wf, speaker_id=speaker)
        buf.seek(0)
        data, rate = sf.read(buf, dtype="float32")
        return to16k(data, rate)

    return run, voice


for name, path in [
    ("piper:thorsten-high", "de/de_DE/thorsten/high/de_DE-thorsten-high"),
    ("piper:kerstin-low", "de/de_DE/kerstin/low/de_DE-kerstin-low"),
    ("piper:eva_k-x_low", "de/de_DE/eva_k/x_low/de_DE-eva_k-x_low"),
    ("piper:ramona-low", "de/de_DE/ramona/low/de_DE-ramona-low"),
]:
    run, _ = piper_synth(path)
    r = evaluate(name, run)
    results.append(r)
    print(json.dumps({k: v for k, v in r.items() if k != "heard"}), flush=True)

mls_run, mls_voice = piper_synth("de/de_DE/mls/medium/de_DE-mls-medium", 0)
n_speakers = getattr(getattr(mls_voice, "config", None), "num_speakers", 1) or 1
female_mls = []
for sid in range(min(n_speakers, 60)):
    run, _ = piper_synth("de/de_DE/mls/medium/de_DE-mls-medium", sid)
    if pitch(run("Ich bin Anna und ich wohne in Berlin.")) > 175:
        female_mls.append(sid)
    if len(female_mls) >= 6:
        break
print("female mls speakers:", female_mls, flush=True)
for sid in female_mls:
    run, _ = piper_synth("de/de_DE/mls/medium/de_DE-mls-medium", sid)
    r = evaluate(f"piper:mls-medium#{sid}", run)
    results.append(r)
    print(json.dumps({k: v for k, v in r.items() if k != "heard"}), flush=True)

try:
    from TTS.api import TTS

    xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    speakers = list(getattr(xtts, "speakers", None) or [])
    female_x = []
    for spk in speakers[:40]:
        wav = np.array(xtts.tts("Ich bin Anna und ich wohne in Berlin.", speaker=spk, language="de"), dtype=np.float32)
        if pitch(to16k(wav, 24000)) > 175:
            female_x.append(spk)
        if len(female_x) >= 5:
            break
    print("female xtts speakers:", female_x, flush=True)
    for spk in female_x:
        def run(text: str, spk=spk) -> np.ndarray:
            return to16k(np.array(xtts.tts(text, speaker=spk, language="de"), dtype=np.float32), 24000)

        r = evaluate(f"xtts:{spk}", run)
        results.append(r)
        print(json.dumps({k: v for k, v in r.items() if k != "heard"}), flush=True)
except Exception as exc:
    print("xtts unavailable:", exc, flush=True)

results.sort(key=lambda r: (-r["target_sound_accuracy"], r["mean_per"]))
json.dump(results, open("/kaggle/working/voice_results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("RANKING")
for r in results:
    print(f"{r['voice']:35s} targets {r['target_sound_accuracy']:.2f}  PER {r['mean_per']:.3f}  pitch {r['median_pitch_hz']:.0f} Hz")
subprocess.run(["rm", "-rf", "/kaggle/working/repo"], check=True)
