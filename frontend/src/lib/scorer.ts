import { recognizePhones } from "./recognizer";
import { referencePhones, scoreAttempt, splitSequence, tokenize, wordMatches, type ScoreResult, type WordResult } from "./phonetics";

export type { Issue, ScoreResult, WordResult } from "./phonetics";

export class ScorerError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const words = tokenize;

export async function scoreLocally(pcm: Float32Array, text: string, transcript: string | null): Promise<ScoreResult> {
  const ws = tokenize(text);
  if (!ws.length) throw new ScorerError("Nothing to score in this text.", false);
  const refs = ws.map(referencePhones);
  if (refs.every((r) => r === null)) {
    if (transcript === null) throw new ScorerError("This text isn't in the pronunciation dictionary yet.", false);
    return basicScore(text, transcript);
  }
  let result: { phones: string[]; ms: number };
  try {
    result = await recognizePhones(pcm);
  } catch (e) {
    throw new ScorerError(`The pronunciation model couldn't run: ${e instanceof Error ? e.message : e}`, true);
  }
  const keep = ws.map((_, i) => refs[i] !== null);
  const scored = scoreAttempt(
    ws.filter((_, i) => keep[i]),
    refs.filter((r): r is string[] => r !== null),
    splitSequence(result.phones.join(" ")),
    transcript,
  );
  if (keep.every(Boolean)) return { ...scored, processingMs: result.ms };
  const understood = transcript !== null ? wordMatches(ws, tokenize(transcript)) : ws.map(() => null);
  let k = 0;
  const merged: WordResult[] = ws.map((w, i) =>
    keep[i] ? scored.words[k++] : { word: w, accuracy: understood[i] ? 1 : 0, understood: understood[i], expected: [], issues: [] },
  );
  return { ...scored, words: merged, processingMs: result.ms };
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export const browserRecognitionAvailable = recognitionCtor() !== null;

export class BrowserTranscriber {
  private rec: SpeechRecognitionLike | null = null;
  private parts: string[] = [];
  private done: Promise<string> | null = null;

  start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = "de-DE";
      rec.interimResults = false;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      this.parts = [];
      this.done = new Promise((resolve) => {
        rec.onresult = (e) => {
          this.parts = Array.from(e.results).map((r) => r[0].transcript);
        };
        rec.onerror = () => resolve(this.parts.join(" "));
        rec.onend = () => resolve(this.parts.join(" "));
      });
      this.rec = rec;
      rec.start();
    } catch {
      this.rec = null;
      this.done = null;
    }
  }

  async stop(): Promise<string | null> {
    if (!this.rec || !this.done) return null;
    this.rec.stop();
    const text = await Promise.race([this.done, new Promise<string>((r) => setTimeout(() => r(this.parts.join(" ")), 2500))]);
    this.rec = null;
    return text;
  }
}

export function basicScore(target: string, transcript: string): ScoreResult {
  const expected = tokenize(target);
  const hits = wordMatches(expected, tokenize(transcript));
  const ratio = expected.length ? hits.filter(Boolean).length / expected.length : 0;
  return {
    score: Math.round(ratio * 100),
    phoneAccuracy: ratio,
    intelligibility: ratio,
    transcript,
    heardPhones: [],
    words: expected.map((w, i) => ({ word: w, accuracy: hits[i] ? 1 : 0, understood: hits[i], expected: [], issues: [] })),
    focus: [],
    mode: "basic",
  };
}
