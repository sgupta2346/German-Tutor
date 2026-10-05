import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "piper-tts", "huggingface_hub"], check=True)
subprocess.run(["git", "clone", "--depth", "1", "https://github.com/sgupta2346/German-Tutor.git", "/kaggle/working/repo"], check=True)

from huggingface_hub import hf_hub_download
from piper import PiperVoice

CONTENT = Path("/kaggle/working/repo/content")
OUT = Path("/kaggle/working/audio")
VOICES = {
    "thorsten": "de/de_DE/thorsten/high/de_DE-thorsten-high",
}
ARTICLE = {"m": "der", "f": "die", "n": "das", "pl": "die"}
GERMANISH = re.compile(r"[äöüßÄÖÜ]|\b(der|die|das|ich|du|er|sie|wir|ein|eine|mein|meine)\b")
EXTRA = [
    "Willkommen! Schön, dass du da bist.",
    "Wie schnell soll ich sprechen?",
    "Hallo, so klinge ich.",
]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def collect() -> list[str]:
    texts: set[str] = set(EXTRA)
    add = lambda t: t and texts.add(norm(t))
    for letter in json.loads((CONTENT / "alphabet.json").read_text(encoding="utf-8")):
        add(letter["letter"])
        add(letter["name"])
        add(letter["example"]["de"])
    for sound in json.loads((CONTENT / "sounds.json").read_text(encoding="utf-8")):
        for e in sound["examples"]:
            add(e["de"])
        for a, b in sound["pairs"]:
            add(a)
            add(b)
    for path in CONTENT.glob("vocab_*.json"):
        for deck in json.loads(path.read_text(encoding="utf-8")):
            for w in deck["words"]:
                add(w["de"])
                add(f"{ARTICLE[w['gender']]} {w['de']}" if w.get("gender") else w["de"])
                add(w["ex"]["de"])
    for path in CONTENT.glob("lessons_*.json"):
        for lesson in json.loads(path.read_text(encoding="utf-8")):
            for s in lesson["steps"]:
                if "de" in s:
                    add(s["de"])
                for row in s.get("table", []):
                    add(row[0])
                for p in s.get("points", []):
                    if GERMANISH.search(p):
                        add(p)
                for o in s.get("options", []):
                    if GERMANISH.search(o) or re.fullmatch(r"[a-zäöüß ,.!?]+", o, re.I):
                        add(o)
                if s["type"] == "build":
                    add(" ".join(s["answer"]))
                    for t in s["answer"] + s["extra"]:
                        add(re.sub(r"[.,!?]", "", t))
                if s["type"] == "match":
                    for de, _ in s["pairs"]:
                        add(de)
    for path in CONTENT.glob("paragraphs*.json"):
        for p in json.loads(path.read_text(encoding="utf-8")):
            add(p["de"])
    return sorted(texts)


def key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def synth(voice: PiperVoice, text: str) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, wf)
        else:
            voice.synthesize(text, wf)
    return buf.getvalue()


def to_mp3(wav: bytes, path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", "pipe:0", "-ac", "1", "-ar", "22050", "-b:a", "48k", str(path)],
        input=wav,
        check=True,
    )


texts = collect()
print(f"{len(texts)} unique strings")
manifest = {"voices": list(VOICES), "files": {t: key(t) for t in texts}}

for name, path in VOICES.items():
    onnx = hf_hub_download("rhasspy/piper-voices", f"{path}.onnx")
    hf_hub_download("rhasspy/piper-voices", f"{path}.onnx.json")
    voice = PiperVoice.load(onnx)
    folder = OUT / name
    folder.mkdir(parents=True, exist_ok=True)
    wavs = [(t, synth(voice, t)) for t in texts]
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        list(pool.map(lambda tw: to_mp3(tw[1], folder / f"{key(tw[0])}.mp3"), wavs))
    print(name, "done", sum(f.stat().st_size for f in folder.iterdir()) / 1e6, "MB")

(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
with tarfile.open("/kaggle/working/audio.tar", "w") as tar:
    tar.add(OUT, arcname="audio")
subprocess.run(["rm", "-rf", str(OUT), "/kaggle/working/repo"], check=True)
print("done")
