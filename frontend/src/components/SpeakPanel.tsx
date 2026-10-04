import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertCircle, Headphones, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import { Recorder, type Recording } from "@/lib/recorder";
import { BrowserTranscriber, scoreLocally, ScorerError, words as splitWords, type ScoreResult, type WordResult } from "@/lib/scorer";
import { loadRecognizer, MODEL_SIZE_MB, useRecognizer } from "@/lib/recognizer";
import { rulesInText } from "@/lib/practice";
import { soundById } from "@/data/content";
import { useStore } from "@/lib/store";
import { PlayButton, Ring, scoreColor } from "./ui";

type Phase = "idle" | "recording" | "processing" | "result" | "error";

const BARS = 28;

function maxSeconds(text: string) {
  return Math.min(60, 4 + splitWords(text).length * 0.7);
}

export function SpeakPanel({
  text,
  compact = false,
  onResult,
}: {
  text: string;
  compact?: boolean;
  onResult?: (r: ScoreResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const rec = useRef<Recorder | null>(null);
  const asr = useRef<BrowserTranscriber | null>(null);
  const raf = useRef<number>(0);
  const startedAt = useRef(0);
  const logAttempt = useStore((s) => s.logAttempt);
  const addXp = useStore((s) => s.addXp);
  const recordSounds = useStore((s) => s.recordSounds);

  const model = useRecognizer();

  useEffect(() => {
    if (model.status === "idle") loadRecognizer().catch(() => {});
  }, [model.status]);

  useEffect(() => {
    setPhase("idle");
    setResult(null);
    setError(null);
    setSelected(null);
    return () => {
      cancelAnimationFrame(raf.current);
      rec.current?.cancel();
    };
  }, [text]);

  useEffect(() => {
    return () => {
      if (recording) URL.revokeObjectURL(recording.url);
    };
  }, [recording]);

  async function start() {
    setError(null);
    setResult(null);
    setSelected(null);
    const r = new Recorder();
    try {
      await r.start();
    } catch {
      setError({ message: "Microphone access was blocked. Allow it in your browser's site settings.", retry: false });
      setPhase("error");
      return;
    }
    rec.current = r;
    asr.current = new BrowserTranscriber();
    asr.current.start();
    startedAt.current = performance.now();
    setPhase("recording");
    const limit = maxSeconds(text);
    const tick = () => {
      const level = r.level();
      setLevels((prev) => [...prev.slice(1), level]);
      const secs = (performance.now() - startedAt.current) / 1000;
      setElapsed(secs);
      if (secs >= limit) {
        finish();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  async function finish() {
    cancelAnimationFrame(raf.current);
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setPhase("processing");
    try {
      const [recorded, heard] = await Promise.all([r.stop(), asr.current?.stop() ?? Promise.resolve(null)]);
      setRecording(recorded);
      const scored = await scoreLocally(recorded.pcm, text, heard?.trim() ? heard : null);
      setResult(scored);
      setPhase("result");
      logAttempt({ text, score: scored.score, at: Date.now(), focus: scored.focus.map((f) => f.rule) });
      if (scored.mode === "full") recordSounds(rulesInText(text), scored.focus.map((f) => f.rule));
      addXp(scored.score >= 85 ? 5 : scored.score >= 60 ? 3 : 1);
      onResult?.(scored);
    } catch (e) {
      const err = e instanceof ScorerError ? e : new ScorerError("Something went wrong while scoring.", true);
      setError({ message: err.message, retry: err.retryable });
      setPhase("error");
    }
  }

  const remaining = Math.max(0, maxSeconds(text) - elapsed);

  return (
    <div className={clsx("w-full", compact ? "space-y-4" : "space-y-6")}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative grid place-items-center">
          <AnimatePresence>
            {phase === "recording" &&
              [0, 1].map((i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full bg-ember/40"
                  style={{ width: compact ? 72 : 96, height: compact ? 72 : 96 }}
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
                />
              ))}
          </AnimatePresence>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            disabled={phase === "processing"}
            onClick={phase === "recording" ? finish : start}
            aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
            className={clsx(
              "relative grid place-items-center rounded-full text-white shadow-xl transition-colors",
              compact ? "h-[72px] w-[72px]" : "h-24 w-24",
              phase === "recording" ? "bg-ember" : "bg-ink text-bg",
            )}
          >
            {phase === "processing" ? (
              <Loader2 className="animate-spin" size={compact ? 26 : 34} />
            ) : phase === "recording" ? (
              <Square size={compact ? 22 : 28} fill="currentColor" />
            ) : (
              <Mic size={compact ? 28 : 36} />
            )}
          </motion.button>
        </div>

        <div className="flex h-10 items-center gap-[3px]" aria-hidden>
          {levels.map((l, i) => (
            <motion.span
              key={i}
              className={clsx("w-1.5 rounded-full", phase === "recording" ? "bg-ember" : "bg-line")}
              animate={{ height: phase === "recording" ? 6 + l * 34 : 6 }}
              transition={{ duration: 0.08 }}
            />
          ))}
        </div>

        <p className="h-5 text-sm text-muted">
          {phase === "idle" && (model.status === "loading" ? `Preparing the pronunciation model (${Math.round(model.progress * 100)}% of ${MODEL_SIZE_MB} MB, first time only)` : "Tap the mic and read the text aloud")}
          {phase === "recording" && `Listening… tap to finish (${Math.ceil(remaining)}s)`}
          {phase === "processing" && (model.status === "loading" ? `Downloading the pronunciation model, first time only (${Math.round(model.progress * 100)}%)` : "Analysing your sounds…")}
          {phase === "result" && result?.mode === "basic" && "Basic check: word recognition only"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {phase === "error" && error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card flex items-center gap-3 border-bad/40 p-4 text-sm"
          >
            <AlertCircle className="shrink-0 text-bad" size={18} />
            <span className="flex-1">{error.message}</span>
            {error.retry && recording && (
              <button
                className="btn btn-ghost text-sm"
                onClick={async () => {
                  setPhase("processing");
                  try {
                    const scored = await scoreLocally(recording.pcm, text, null);
                    setResult(scored);
                    setPhase("result");
                    onResult?.(scored);
                  } catch (e) {
                    setError({ message: e instanceof Error ? e.message : "Scoring failed", retry: true });
                    setPhase("error");
                  }
                }}
              >
                <RotateCcw size={14} /> Retry
              </button>
            )}
          </motion.div>
        )}
        {phase === "result" && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ResultView
              result={result}
              compact={compact}
              recordingUrl={recording?.url}
              selected={selected}
              onSelect={setSelected}
              onRetry={start}
              target={text}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function verdict(score: number) {
  if (score >= 92) return "Ausgezeichnet!";
  if (score >= 80) return "Sehr gut!";
  if (score >= 65) return "Gut, fast da";
  if (score >= 45) return "Weiter üben";
  return "Noch einmal";
}

function ResultView({
  result,
  compact,
  recordingUrl,
  selected,
  onSelect,
  onRetry,
  target,
}: {
  result: ScoreResult;
  compact: boolean;
  recordingUrl?: string;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onRetry: () => void;
  target: string;
}) {
  const color = scoreColor(result.score);
  const word = selected !== null ? result.words[selected] : null;
  return (
    <div className="space-y-5">
      <div className={clsx("flex items-center gap-5", compact && "justify-center")}>
        <Ring value={result.score / 100} size={compact ? 84 : 108} stroke={compact ? 8 : 10} color={color}>
          <span className="font-display text-2xl font-extrabold" style={{ color }}>
            {result.score}
          </span>
        </Ring>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold">{verdict(result.score)}</p>
          {result.transcript !== null && (
            <p className="mt-1 truncate text-sm text-muted">
              Heard: <span className="italic text-ink">“{result.transcript || "…"}”</span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {recordingUrl && (
              <button className="btn btn-ghost text-sm" onClick={() => new Audio(recordingUrl).play()}>
                <Headphones size={15} /> You
              </button>
            )}
            <PlayButton text={target} size="sm" label="Play the model pronunciation" />
            <button className="btn btn-ghost text-sm" onClick={onRetry}>
              <RotateCcw size={15} /> Again
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {result.words.map((w, i) => (
          <WordChip key={i} w={w} active={selected === i} onClick={() => onSelect(selected === i ? null : i)} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {word && <WordDetail key={selected} w={word} onClose={() => onSelect(null)} />}
      </AnimatePresence>

      {!word && result.focus.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Focus on</p>
          {result.focus.slice(0, 3).map((f) => (
            <RuleTip key={f.rule} rule={f.rule} count={f.count} />
          ))}
        </div>
      )}
      {!word && result.mode === "full" && result.focus.length === 0 && result.score < 85 && (
        <p className="text-sm text-muted">Tap a highlighted word to see exactly which sounds were off.</p>
      )}
    </div>
  );
}

function WordChip({ w, active, onClick }: { w: WordResult; active: boolean; onClick: () => void }) {
  const pct = Math.round(w.accuracy * 100);
  const color = scoreColor(pct);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={clsx(
        "rounded-xl border-2 px-3 py-1.5 font-display text-lg font-semibold transition-shadow",
        active && "shadow-lg",
      )}
      style={{
        borderColor: color,
        background: `color-mix(in oklab, ${color} ${active ? 26 : 12}%, transparent)`,
      }}
    >
      {w.word}
      {w.understood === false && <span className="ml-1 align-super text-xs text-bad">?</span>}
    </motion.button>
  );
}

function WordDetail({ w, onClose }: { w: WordResult; onClose: () => void }) {
  const rules = [...new Set(w.issues.map((i) => i.rule).filter(Boolean))] as string[];
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <PlayButton text={w.word} size="sm" />
          <PlayButton text={w.word} size="sm" slow />
          <p className="flex-1 font-display text-2xl font-bold">{w.word}</p>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {w.expected.length > 0 && (
          <p className="text-sm text-muted">
            Target sounds: <span className="font-mono text-ink">/{w.expected.join(" ")}/</span>
          </p>
        )}
        {w.issues.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {w.issues.map((i, k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="font-mono">
                  {i.kind === "sub" && (
                    <>
                      /{i.expected}/ → <span className="text-bad">/{i.heard}/</span>
                    </>
                  )}
                  {i.kind === "del" && (
                    <>
                      /{i.expected}/ → <span className="text-bad">missing</span>
                    </>
                  )}
                  {i.kind === "ins" && (
                    <>
                      extra <span className="text-bad">/{i.heard}/</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-good">{w.understood === false ? "Sounds were close, but the word wasn't recognised. Try saying it more clearly." : "Nicely done, every sound landed."}</p>
        )}
        {rules.map((r) => (
          <RuleTip key={r} rule={r} />
        ))}
      </div>
    </motion.div>
  );
}

export function RuleTip({ rule, count }: { rule: string; count?: number }) {
  const s = soundById.get(rule);
  if (!s) return null;
  return (
    <div className="rounded-2xl bg-raised p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-gold px-2 font-display font-bold text-[#17141f]">{s.symbol}</span>
        <p className="font-semibold">{s.title}</p>
        {count && count > 1 && <span className="chip ml-auto">×{count}</span>}
      </div>
      <p className="mt-2 text-sm">{s.howTo}</p>
      <p className="mt-1 text-sm text-muted">{s.trap}</p>
      {s.examples[0] && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <PlayButton text={s.examples[0].de} size="sm" />
          <span className="font-semibold">{s.examples[0].de}</span>
          <span className="text-muted">· {s.examples[0].en}</span>
        </div>
      )}
    </div>
  );
}
