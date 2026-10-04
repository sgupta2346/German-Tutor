import os
import threading
from functools import lru_cache

import numpy as np

from .phones import split_sequence

PHONEME_MODEL = os.environ.get("PHONEME_MODEL", "facebook/wav2vec2-xlsr-53-espeak-cv-ft")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
SAMPLE_RATE = 16000

_lock = threading.Lock()


@lru_cache(maxsize=1)
def _phoneme_model():
    import torch
    from transformers import AutoProcessor, Wav2Vec2ForCTC

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    processor = AutoProcessor.from_pretrained(PHONEME_MODEL)
    model = Wav2Vec2ForCTC.from_pretrained(PHONEME_MODEL).eval()
    return processor, model


@lru_cache(maxsize=1)
def _whisper():
    from faster_whisper import WhisperModel

    return WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")


@lru_cache(maxsize=4096)
def reference_phones(word: str) -> tuple[str, ...]:
    from phonemizer import phonemize
    from phonemizer.separator import Separator

    out = phonemize(
        word,
        language="de",
        backend="espeak",
        separator=Separator(phone=" ", word=" ", syllable=""),
        strip=True,
        preserve_punctuation=False,
        with_stress=False,
    )
    return tuple(split_sequence(out))


def recognize_phones(audio: np.ndarray) -> list[str]:
    import torch

    processor, model = _phoneme_model()
    inputs = processor(audio, sampling_rate=SAMPLE_RATE, return_tensors="pt")
    with _lock, torch.inference_mode():
        logits = model(inputs.input_values).logits
    ids = torch.argmax(logits, dim=-1)
    text = processor.batch_decode(ids)[0]
    return split_sequence(text)


def transcribe(audio: np.ndarray) -> str:
    segments, _ = _whisper().transcribe(
        audio,
        language="de",
        beam_size=1,
        vad_filter=False,
        condition_on_previous_text=False,
    )
    return " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()


def warm_up() -> None:
    _phoneme_model()
    _whisper()
    reference_phones("hallo")
