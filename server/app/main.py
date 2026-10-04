import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .audio import AudioError, load_wav
from .scoring import score_attempt, tokenize

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 600


@asynccontextmanager
async def lifespan(_: FastAPI):
    if os.environ.get("SKIP_WARMUP") != "1":
        await run_in_threadpool(models.warm_up)
    yield


app = FastAPI(title="German pronunciation scorer", version="0.1.0", lifespan=lifespan)

origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=os.environ.get("ALLOWED_ORIGIN_REGEX"),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "phonemeModel": models.PHONEME_MODEL, "whisperModel": models.WHISPER_MODEL}


@app.get("/api/phonemes")
def phonemes(text: str) -> dict:
    words = tokenize(text[:MAX_TEXT_CHARS])
    return {"words": [{"word": w, "phones": list(models.reference_phones(w))} for w in words]}


def _score(data: bytes, text: str, with_transcript: bool) -> dict:
    started = time.perf_counter()
    audio = load_wav(data)
    words = tokenize(text)
    ref = [list(models.reference_phones(w)) for w in words]
    hyp = models.recognize_phones(audio)
    transcript = models.transcribe(audio) if with_transcript else None
    result = score_attempt(words, ref, hyp, transcript)
    result["durationSeconds"] = round(len(audio) / models.SAMPLE_RATE, 2)
    result["processingMs"] = round((time.perf_counter() - started) * 1000)
    return result


@app.post("/api/score")
async def score(audio: UploadFile = File(...), text: str = Form(...), transcript: bool = Form(True)) -> dict:
    text = text.strip()
    if not text or len(text) > MAX_TEXT_CHARS:
        raise HTTPException(422, f"Text must be 1 to {MAX_TEXT_CHARS} characters")
    if not tokenize(text):
        raise HTTPException(422, "Text has no German words")
    data = await audio.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Audio file is too large")
    try:
        return await run_in_threadpool(_score, data, text, transcript)
    except AudioError as exc:
        raise HTTPException(422, str(exc)) from exc
