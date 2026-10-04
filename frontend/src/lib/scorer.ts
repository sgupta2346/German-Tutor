const SCORER_URL = (import.meta.env.VITE_SCORER_URL as string | undefined)?.replace(/\/$/, "");

export interface Issue {
  kind: "sub" | "del" | "ins";
  expected: string | null;
  heard: string | null;
  word: number | null;
  rule: string | null;
}

export interface WordResult {
  word: string;
  accuracy: number;
  understood: boolean | null;
  expected: string[];
  issues: Issue[];
}

export interface ScoreResult {
  score: number;
  phoneAccuracy: number;
  intelligibility: number | null;
  transcript: string | null;
  heardPhones: string[];
  words: WordResult[];
  focus: { rule: string; count: number }[];
  processingMs?: number;
  mode: "full" | "basic";
}

export class ScorerError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const scorerConfigured = Boolean(SCORER_URL);

export async function scorerHealth(): Promise<boolean> {
  if (!SCORER_URL) return false;
  try {
    const r = await fetch(`${SCORER_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function scoreRecording(wav: Blob, text: string): Promise<ScoreResult> {
  if (!SCORER_URL) throw new ScorerError("The pronunciation scorer isn't configured.", false);
  const form = new FormData();
  form.append("audio", wav, "attempt.wav");
  form.append("text", text);
  let res: Response;
  try {
    res = await fetch(`${SCORER_URL}/api/score`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new ScorerError("Couldn't reach the scorer. It may be waking up, try again in a minute.", true);
  }
  if (!res.ok) {
    const detail = await res.json().then((j) => j.detail as string).catch(() => res.statusText);
    throw new ScorerError(detail || "Scoring failed", res.status >= 500);
  }
  return { ...(await res.json()), mode: "full" };
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export const browserRecognitionAvailable = typeof window !== "undefined" && recognitionCtor() !== null;

export class BrowserTranscriber {
  private rec: SpeechRecognitionLike | null = null;
  private parts: string[] = [];
  private done: Promise<string> | null = null;

  start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
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
  }

  async stop(): Promise<string | null> {
    if (!this.rec || !this.done) return null;
    this.rec.stop();
    const text = await Promise.race([this.done, new Promise<string>((r) => setTimeout(() => r(this.parts.join(" ")), 2500))]);
    this.rec = null;
    return text;
  }
}

const WORD = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

function norm(w: string) {
  return w.toLowerCase().replace(/ß/g, "ss");
}

export function basicScore(target: string, transcript: string): ScoreResult {
  const expected = words(target);
  const pool = new Map<string, number>();
  for (const w of words(transcript)) pool.set(norm(w), (pool.get(norm(w)) ?? 0) + 1);
  const results: WordResult[] = expected.map((w) => {
    const k = norm(w);
    const hit = (pool.get(k) ?? 0) > 0;
    if (hit) pool.set(k, pool.get(k)! - 1);
    return { word: w, accuracy: hit ? 1 : 0, understood: hit, expected: [], issues: [] };
  });
  const ratio = results.length ? results.filter((r) => r.understood).length / results.length : 0;
  return {
    score: Math.round(ratio * 100),
    phoneAccuracy: ratio,
    intelligibility: ratio,
    transcript,
    heardPhones: [],
    words: results,
    focus: [],
    mode: "basic",
  };
}
