import io

import numpy as np
import soundfile as sf

TARGET_RATE = 16000
MAX_SECONDS = 60
MIN_SECONDS = 0.3


class AudioError(ValueError):
    pass


def resample(audio: np.ndarray, rate: int) -> np.ndarray:
    if rate == TARGET_RATE:
        return audio
    duration = len(audio) / rate
    target_len = int(round(duration * TARGET_RATE))
    x_old = np.linspace(0.0, duration, num=len(audio), endpoint=False)
    x_new = np.linspace(0.0, duration, num=target_len, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


def load_wav(data: bytes) -> np.ndarray:
    try:
        audio, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except Exception as exc:
        raise AudioError("Could not read audio, send 16 kHz mono WAV") from exc
    audio = audio.mean(axis=1)
    audio = resample(audio, rate)
    seconds = len(audio) / TARGET_RATE
    if seconds < MIN_SECONDS:
        raise AudioError("Recording is too short")
    if seconds > MAX_SECONDS:
        raise AudioError(f"Recording is longer than {MAX_SECONDS} seconds")
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-3:
        raise AudioError("Recording is silent, check your microphone")
    return trim_silence(audio / peak * 0.9)


def trim_silence(audio: np.ndarray, threshold: float = 0.02, pad: float = 0.15) -> np.ndarray:
    frame = int(0.02 * TARGET_RATE)
    if len(audio) < frame * 3:
        return audio
    energy = np.array([np.sqrt(np.mean(audio[i:i + frame] ** 2)) for i in range(0, len(audio) - frame, frame)])
    voiced = np.where(energy > threshold)[0]
    if len(voiced) == 0:
        return audio
    margin = int(pad * TARGET_RATE)
    start = max(0, voiced[0] * frame - margin)
    end = min(len(audio), (voiced[-1] + 1) * frame + margin)
    return audio[start:end]
