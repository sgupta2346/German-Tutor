import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import confetti from "canvas-confetti";
import { Check, Flame, Star, X, Zap } from "lucide-react";
import { lessonById, lessonOrder, unitById } from "@/data/content";
import type { Step } from "@/data/types";
import { speak } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { PlayButton, ProgressBar } from "@/components/ui";
import { SpeakPanel } from "@/components/SpeakPanel";

type Feedback = { correct: boolean; answer?: string; explain?: string; close?: boolean } | null;
type SetCheck = React.Dispatch<React.SetStateAction<(() => Feedback) | null>>;

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[.,!?;:"„“'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GRADED = new Set(["choice", "build", "listen", "match"]);

export default function LessonPlayer() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const lesson = lessonById.get(id);
  const addXp = useStore((s) => s.addXp);
  const completeLesson = useStore((s) => s.completeLesson);

  const [queue, setQueue] = useState<Step[]>(() => lesson?.steps ?? []);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [ready, setReady] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState(false);
  const [checkFn, setCheckFn] = useState<(() => Feedback) | null>(null);

  useEffect(() => {
    setQueue(lesson?.steps ?? []);
    setIndex(0);
    setFinished(false);
    setMistakes(0);
  }, [lesson]);

  const step = queue[index];
  const graded = step ? GRADED.has(step.type) : false;
  const total = lesson?.steps.length ?? 1;

  const advance = useCallback(() => {
    setFeedback(null);
    setReady(false);
    setCheckFn(null);
    if (index + 1 >= queue.length) {
      const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
      completeLesson(id, stars);
      addXp(10 + stars * 2);
      setFinished(true);
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ["#ffcc33", "#ff5a3c", "#17141f", "#3b82f6"] });
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, queue.length, mistakes, completeLesson, id, addXp]);

  const check = useCallback(() => {
    if (!checkFn || !step) return;
    const fb = checkFn();
    if (!fb) return;
    setFeedback(fb);
    if (fb.correct) {
      setCombo((c) => c + 1);
    } else {
      setCombo(0);
      setMistakes((m) => m + 1);
      setQueue((q) => [...q, step]);
    }
  }, [checkFn, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement)?.tagName === "BUTTON") return;
      if (feedback) advance();
      else if (graded && ready) check();
      else if (!graded && ready) advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedback, graded, ready, check, advance]);

  if (!lesson) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-display text-3xl font-bold">Lesson not found</p>
          <Link to="/learn" className="btn btn-primary mt-6">
            Back to your path
          </Link>
        </div>
      </div>
    );
  }

  if (finished) {
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    const nextId = lessonOrder[lessonOrder.indexOf(id) + 1];
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md text-center">
          <div className="flex justify-center gap-3">
            {[1, 2, 3].map((s) => (
              <motion.div key={s} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2 + s * 0.18, type: "spring", stiffness: 260, damping: 12 }}>
                <Star size={s === 2 ? 72 : 56} className={s <= stars ? "text-gold" : "text-line"} fill="currentColor" />
              </motion.div>
            ))}
          </div>
          <h1 className="mt-6 font-display text-5xl font-extrabold">{stars === 3 ? "Perfect!" : stars === 2 ? "Great job!" : "Lesson done!"}</h1>
          <p className="mt-2 text-muted">{lesson.title} complete</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="card p-4">
              <Zap className="mx-auto text-gold" />
              <p className="mt-1 font-display text-2xl font-extrabold">+{10 + stars * 2}</p>
              <p className="text-xs text-muted">XP</p>
            </div>
            <div className="card p-4">
              <Check className="mx-auto text-good" />
              <p className="mt-1 font-display text-2xl font-extrabold">{Math.round((total / (total + mistakes)) * 100)}%</p>
              <p className="text-xs text-muted">accuracy</p>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            {nextId && (
              <button className="btn btn-gold w-full" onClick={() => navigate(`/lesson/${nextId}`)}>
                Next lesson
              </button>
            )}
            <button className="btn btn-ghost w-full" onClick={() => navigate("/learn")}>
              Back to path
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const unit = unitById.get(lesson.unit);
  const progress = Math.min(index, total) / total;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 pt-5 md:pt-8">
        <button aria-label="Quit lesson" onClick={() => navigate("/learn")} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
          <X size={24} />
        </button>
        <ProgressBar value={progress} className="h-4" />
        <AnimatePresence>
          {combo >= 3 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1 font-bold text-ember">
              <Flame size={18} fill="currentColor" />
              {combo}
            </motion.span>
          )}
        </AnimatePresence>
      </header>
      <p className="mx-auto mt-3 w-full max-w-3xl px-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {unit?.titleDe} · {lesson.title}
      </p>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 md:py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${step.type}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex-1"
          >
            <StepView step={step} locked={!!feedback} setReady={setReady} setCheck={setCheckFn} />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer
        className={clsx(
          "sticky bottom-0 border-t transition-colors",
          feedback ? (feedback.correct ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10") : "border-line bg-surface/70 backdrop-blur-xl",
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] md:flex-row md:items-center">
          <AnimatePresence mode="wait">
            {feedback ? (
              <motion.div key="fb" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-1 items-start gap-3">
                <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-full text-white", feedback.correct ? "bg-good" : "bg-bad")}>
                  {feedback.correct ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
                </span>
                <div>
                  <p className={clsx("font-display text-xl font-bold", feedback.correct ? "text-good" : "text-bad")}>
                    {feedback.correct ? (feedback.close ? "Almost perfect" : ["Correct!", "Nice!", "Great!", "Well done!"][index % 4]) : "Not quite"}
                  </p>
                  {feedback.answer && (
                    <p className="text-sm">
                      {feedback.correct ? "Exact spelling:" : "Correct answer:"} <span className="font-semibold">{feedback.answer}</span>
                    </p>
                  )}
                  {feedback.explain && <p className="mt-1 text-sm text-muted">{feedback.explain}</p>}
                </div>
              </motion.div>
            ) : (
              <div className="flex-1">
                {step.type === "speak" && (
                  <button className="text-sm font-semibold text-muted hover:text-ink" onClick={advance}>
                    Can't speak right now
                  </button>
                )}
              </div>
            )}
          </AnimatePresence>
          <button
            className={clsx("btn w-full md:w-48", feedback && !feedback.correct ? "btn-primary !bg-bad !text-white" : "btn-gold")}
            disabled={!feedback && !ready}
            onClick={() => (feedback ? advance() : graded ? check() : advance())}
          >
            {feedback || !graded ? "Continue" : "Check"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function StepView({
  step,
  locked,
  setReady,
  setCheck,
}: {
  step: Step;
  locked: boolean;
  setReady: (b: boolean) => void;
  setCheck: SetCheck;
}) {
  switch (step.type) {
    case "intro":
      return <IntroStep step={step} setReady={setReady} />;
    case "phrase":
      return <PhraseStep step={step} setReady={setReady} />;
    case "choice":
      return <ChoiceStep step={step} locked={locked} setReady={setReady} setCheck={setCheck} />;
    case "build":
      return <BuildStep step={step} locked={locked} setReady={setReady} setCheck={setCheck} />;
    case "listen":
      return <ListenStep step={step} locked={locked} setReady={setReady} setCheck={setCheck} />;
    case "speak":
      return <SpeakStep step={step} setReady={setReady} />;
    case "match":
      return <MatchStep step={step} setReady={setReady} setCheck={setCheck} />;
  }
}

function hasGerman(s: string) {
  return /[äöüßÄÖÜ]|\b(der|die|das|ich|du|er|sie|wir|ein|eine|mein|meine)\b/.test(s);
}

function IntroStep({ step, setReady }: { step: Extract<Step, { type: "intro" }>; setReady: (b: boolean) => void }) {
  useEffect(() => setReady(true), [setReady]);
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">New idea</p>
      <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight">{step.title}</h2>
      <p className="mt-4 text-lg leading-relaxed">{step.body}</p>
      {step.points && (
        <ul className="mt-6 space-y-2">
          {step.points.map((p) => (
            <li key={p} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
              {hasGerman(p) ? <PlayButton text={p} size="sm" /> : <span className="ml-3 h-2 w-2 rounded-full bg-gold" />}
              <span className="font-medium">{p}</span>
            </li>
          ))}
        </ul>
      )}
      {step.table && (
        <div className="card mt-6 divide-y divide-line overflow-hidden">
          {step.table.map(([de, en]) => (
            <div key={de} className="flex items-center gap-3 px-4 py-2.5">
              <PlayButton text={de} size="sm" />
              <span className="flex-1 font-display text-lg font-semibold">{de}</span>
              <span className="text-sm text-muted">{en}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhraseStep({ step, setReady }: { step: Extract<Step, { type: "phrase" }>; setReady: (b: boolean) => void }) {
  const [revealed, setRevealed] = useState(false);
  const autoplay = useStore((s) => s.settings.autoplay);
  useEffect(() => {
    setReady(true);
    if (autoplay) speak(step.de);
  }, [step.de, autoplay, setReady]);
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">Listen and repeat</p>
      <div className="mt-8 flex gap-3">
        <PlayButton text={step.de} size="lg" />
        <PlayButton text={step.de} size="lg" slow />
      </div>
      <h2 className="mt-8 font-display text-4xl font-extrabold tracking-tight text-balance md:text-5xl">{step.de}</h2>
      <button onClick={() => setRevealed(true)} className={clsx("mt-4 text-lg transition-all", revealed ? "text-muted" : "rounded-full bg-raised px-4 py-1 text-sm font-semibold text-muted")}>
        {revealed ? step.en : "Show meaning"}
      </button>
      {step.note && <p className="mt-6 max-w-md rounded-2xl bg-gold/15 px-4 py-3 text-sm">{step.note}</p>}
    </div>
  );
}

function ChoiceStep({
  step,
  locked,
  setReady,
  setCheck,
}: {
  step: Extract<Step, { type: "choice" }>;
  locked: boolean;
  setReady: (b: boolean) => void;
  setCheck: SetCheck;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    setReady(picked !== null);
    setCheck(() => () =>
      picked === null
        ? null
        : { correct: picked === step.answer, answer: picked === step.answer ? undefined : step.options[step.answer], explain: step.explain },
    );
  }, [picked, step, setReady, setCheck]);
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">Choose the right answer</p>
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{step.prompt}</h2>
      <div className="mt-8 grid gap-3">
        {step.options.map((o, i) => {
          const state = locked ? (i === step.answer ? "right" : i === picked ? "wrong" : "idle") : picked === i ? "picked" : "idle";
          return (
            <motion.button
              key={o}
              whileTap={{ scale: 0.98 }}
              disabled={locked}
              onClick={() => {
                setPicked(i);
                if (hasGerman(o) || /^[a-zäöüß ,.!?]+$/i.test(o)) speak(o);
              }}
              className={clsx(
                "flex items-center gap-4 rounded-2xl border-2 p-4 text-left text-lg font-semibold transition-colors",
                state === "idle" && "border-line bg-surface hover:border-muted",
                state === "picked" && "border-der bg-der/10",
                state === "right" && "border-good bg-good/15",
                state === "wrong" && "border-bad bg-bad/15",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-line text-sm text-muted">{i + 1}</span>
              {o}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function BuildStep({
  step,
  locked,
  setReady,
  setCheck,
}: {
  step: Extract<Step, { type: "build" }>;
  locked: boolean;
  setReady: (b: boolean) => void;
  setCheck: SetCheck;
}) {
  const bank = useMemo(() => shuffle([...step.answer, ...step.extra].map((t, i) => ({ t, i }))), [step]);
  const [chosen, setChosen] = useState<number[]>([]);
  useEffect(() => {
    setReady(chosen.length > 0);
    setCheck(() => () => {
      const built = chosen.map((i) => bank.find((b) => b.i === i)!.t).join(" ");
      const target = step.answer.join(" ");
      const correct = normalizeAnswer(built) === normalizeAnswer(target);
      if (correct) speak(target);
      return { correct, answer: correct ? undefined : target };
    });
  }, [chosen, bank, step, setReady, setCheck]);

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">Build the sentence</p>
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">{step.en}</h2>
      <div className="mt-8 flex min-h-[72px] flex-wrap content-start gap-2 border-b-2 border-dashed border-line pb-4">
        {chosen.map((i) => {
          const tile = bank.find((b) => b.i === i)!;
          return (
            <motion.button
              layoutId={`tile-${i}`}
              key={i}
              disabled={locked}
              onClick={() => setChosen((c) => c.filter((x) => x !== i))}
              className="rounded-xl border-2 border-line bg-surface px-4 py-2 text-lg font-semibold shadow-[0_3px_0_var(--line)]"
            >
              {tile.t}
            </motion.button>
          );
        })}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {bank.map(({ t, i }) =>
          chosen.includes(i) ? (
            <span key={i} className="rounded-xl bg-raised px-4 py-2 text-lg font-semibold text-transparent">
              {t}
            </span>
          ) : (
            <motion.button
              layoutId={`tile-${i}`}
              key={i}
              disabled={locked}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                setChosen((c) => [...c, i]);
                speak(t.replace(/[.,!?]/g, ""));
              }}
              className="rounded-xl border-2 border-line bg-surface px-4 py-2 text-lg font-semibold shadow-[0_3px_0_var(--line)]"
            >
              {t}
            </motion.button>
          ),
        )}
      </div>
    </div>
  );
}

function ListenStep({
  step,
  locked,
  setReady,
  setCheck,
}: {
  step: Extract<Step, { type: "listen" }>;
  locked: boolean;
  setReady: (b: boolean) => void;
  setCheck: SetCheck;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const t = setTimeout(() => speak(step.de), 350);
    return () => clearTimeout(t);
  }, [step.de]);
  useEffect(() => {
    setReady(value.trim().length > 0);
    setCheck(() => () => {
      const a = normalizeAnswer(value);
      const b = normalizeAnswer(step.de);
      if (a === b) return { correct: true, explain: step.en };
      const tolerance = Math.max(1, Math.floor(b.length / 10));
      if (editDistance(a, b) <= tolerance) return { correct: true, close: true, answer: step.de, explain: step.en };
      return { correct: false, answer: step.de, explain: step.en };
    });
  }, [value, step, setReady, setCheck]);

  const insert = (ch: string) => setValue((v) => v + ch);

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">Type what you hear</p>
      <div className="mt-8 flex justify-center gap-4">
        <PlayButton text={step.de} size="lg" />
        <PlayButton text={step.de} size="lg" slow />
      </div>
      <textarea
        autoFocus
        disabled={locked}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        rows={3}
        lang="de"
        spellCheck={false}
        placeholder="Type in German…"
        className="mt-8 w-full resize-none rounded-2xl border-2 border-line bg-surface p-4 text-xl font-medium outline-none focus:border-der"
      />
      <div className="mt-3 flex gap-2">
        {["ä", "ö", "ü", "ß"].map((ch) => (
          <button key={ch} disabled={locked} onClick={() => insert(ch)} className="btn btn-ghost h-10 w-10 !p-0 text-lg">
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpeakStep({ step, setReady }: { step: Extract<Step, { type: "speak" }>; setReady: (b: boolean) => void }) {
  useEffect(() => setReady(false), [step, setReady]);
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">Say it out loud</p>
      <div className="mt-6 flex items-center gap-3">
        <PlayButton text={step.de} />
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{step.de}</h2>
      </div>
      <p className="mt-2 text-muted">{step.en}</p>
      <div className="mt-8 w-full max-w-xl text-left">
        <SpeakPanel text={step.de} compact onResult={() => setReady(true)} />
      </div>
    </div>
  );
}

function MatchStep({
  step,
  setReady,
  setCheck,
}: {
  step: Extract<Step, { type: "match" }>;
  setReady: (b: boolean) => void;
  setCheck: SetCheck;
}) {
  const left = useMemo(() => shuffle(step.pairs.map((p) => p[0])), [step]);
  const right = useMemo(() => shuffle(step.pairs.map((p) => p[1])), [step]);
  const [sel, setSel] = useState<{ side: "l" | "r"; v: string } | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const [errors, setErrors] = useState(0);
  const lookup = useMemo(() => new Map(step.pairs.map(([a, b]) => [a, b])), [step]);

  useEffect(() => {
    const complete = done.length === step.pairs.length;
    setReady(complete);
    setCheck(() => () => (complete ? { correct: errors <= 1, explain: errors > 1 ? `${errors} wrong matches along the way.` : undefined } : null));
  }, [done, errors, step, setReady, setCheck]);

  function pick(side: "l" | "r", v: string) {
    if (side === "l") speak(v);
    if (!sel || sel.side === side) return setSel({ side, v });
    const de = side === "l" ? v : sel.v;
    const en = side === "l" ? sel.v : v;
    if (lookup.get(de) === en) {
      setDone((d) => [...d, de]);
    } else {
      setErrors((e) => e + 1);
      setWrong([de, en]);
      setTimeout(() => setWrong([]), 450);
    }
    setSel(null);
  }

  const tile = (side: "l" | "r", v: string) => {
    const isDone = side === "l" ? done.includes(v) : done.some((d) => lookup.get(d) === v);
    const isSel = sel?.side === side && sel.v === v;
    const isWrong = wrong.includes(v);
    return (
      <motion.button
        key={v}
        disabled={isDone}
        animate={isWrong ? { x: [0, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.35 }}
        onClick={() => pick(side, v)}
        className={clsx(
          "rounded-2xl border-2 p-4 text-lg font-semibold transition-all",
          isDone && "scale-95 border-good/40 bg-good/10 text-good opacity-60",
          !isDone && isSel && "border-der bg-der/10",
          !isDone && !isSel && isWrong && "border-bad bg-bad/10",
          !isDone && !isSel && !isWrong && "border-line bg-surface hover:border-muted",
        )}
      >
        {v}
      </motion.button>
    );
  };

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">Match the pairs</p>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <div className="grid gap-3">{left.map((v) => tile("l", v))}</div>
        <div className="grid gap-3">{right.map((v) => tile("r", v))}</div>
      </div>
    </div>
  );
}
