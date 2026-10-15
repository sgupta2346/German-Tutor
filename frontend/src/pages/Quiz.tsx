import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import confetti from "canvas-confetti";
import { Check, Flag, Flame, RotateCcw, Timer, Volume2, X, Zap } from "lucide-react";
import { Rating } from "ts-fsrs";
import { ARTICLE, deckById, withArticle } from "@/data/content";
import type { VocabCard } from "@/data/types";
import { preloadAudio, speak } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { allCards, FLAGGED_DECK, isDue, isNew, review, TUTOR_DECK } from "@/lib/srs";
import { editDistance, normalizeAnswer } from "@/pages/LessonPlayer";
import { PlayButton, ProgressBar, Ring, scoreColor } from "@/components/ui";

type Kind = "meaning" | "recall" | "article" | "listen" | "type";
interface Question {
  kind: Kind;
  card: VocabCard;
  options: string[];
  answer: string;
}

const LENGTH = 10;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function said(card: VocabCard): string {
  return card.gender ? withArticle(card) : card.de;
}

function pickKind(card: VocabCard, index: number): Kind {
  const kinds: Kind[] = ["meaning", "recall", "listen", "type"];
  if (card.gender && card.gender !== "pl") kinds.push("article", "article");
  return kinds[(index * 7 + card.de.length) % kinds.length];
}

function buildQuestions(pool: VocabCard[], distractors: VocabCard[], count: number): Question[] {
  const chosen = shuffle(pool).slice(0, count);
  return chosen.map((card, i) => {
    const kind = pickKind(card, i);
    const others = shuffle(distractors.filter((c) => c.id !== card.id && c.en !== card.en && c.de !== card.de));
    const samePos = others.filter((c) => c.pos === card.pos);
    const pickFrom = (samePos.length >= 3 ? samePos : others).slice(0, 3);
    if (kind === "meaning") return { kind, card, answer: card.en, options: shuffle([card.en, ...pickFrom.map((c) => c.en)]) };
    if (kind === "article") return { kind, card, answer: ARTICLE[card.gender!], options: ["der", "die", "das"] };
    if (kind === "type") return { kind, card, answer: card.de, options: [] };
    return { kind, card, answer: said(card), options: shuffle([said(card), ...pickFrom.map(said)]) };
  });
}

export default function Quiz() {
  const { deckId = "review" } = useParams();
  const navigate = useNavigate();
  const srs = useStore((s) => s.srs);
  const known = useStore((s) => s.known);
  const flagged = useStore((s) => s.flagged);
  const saveCard = useStore((s) => s.saveCard);
  const addXp = useStore((s) => s.addXp);
  const toggleFlag = useStore((s) => s.toggleFlag);

  const deck = deckById.get(deckId);
  const title = deck ? deck.title : deckId === FLAGGED_DECK ? "Flagged words" : deckId === TUTOR_DECK ? "Saved words" : "Words you've studied";

  const { pool, distractors } = useMemo(() => {
    const every = allCards().filter((c) => !known[c.id]);
    let p: VocabCard[];
    if (deck || deckId === TUTOR_DECK) p = every.filter((c) => c.deckId === deckId);
    else if (deckId === FLAGGED_DECK) p = every.filter((c) => flagged[c.id]);
    else {
      p = every.filter((c) => !isNew(srs[c.id]));
      if (p.length < 4) p = every.filter((c) => c.deckId.startsWith("a1-")).slice(0, 40);
    }
    const level = p[0]?.deckId.split("-")[0];
    const d = every.filter((c) => c.deckId.split("-")[0] === level);
    return { pool: p, distractors: d.length >= 4 ? d : every };
  }, [deckId, deck, known, flagged, srs]);

  const [round, setRound] = useState(0);
  const [questions, setQuestions] = useState<Question[]>(() => buildQuestions(pool, distractors, LENGTH));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<{ card: VocabCard; ok: boolean }[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [stage, setStage] = useState<"questions" | "match" | "done">("questions");
  const [matchCards, setMatchCards] = useState<VocabCard[]>([]);

  useEffect(() => {
    const level = pool[0]?.deckId.split("-")[0];
    if (level) preloadAudio([level]);
  }, [pool]);

  const q = questions[index];

  useEffect(() => {
    if (q && q.kind === "listen") {
      const t = setTimeout(() => speak(said(q.card)), 300);
      return () => clearTimeout(t);
    }
  }, [q]);

  const answer = useCallback(
    (value: string) => {
      if (!q || picked !== null) return;
      const ok =
        q.kind === "type"
          ? normalizeAnswer(value) === normalizeAnswer(q.answer) || editDistance(normalizeAnswer(value), normalizeAnswer(q.answer)) <= Math.max(0, Math.floor(q.answer.length / 8))
          : value === q.answer;
      setPicked(value);
      setResults((r) => [...r, { card: q.card, ok }]);
      speak(said(q.card));
      const stored = srs[q.card.id];
      if (!ok) {
        saveCard(q.card.id, review(stored, Rating.Again), isNew(stored));
        setStreak(0);
      } else {
        if (isDue(stored)) saveCard(q.card.id, review(stored, Rating.Good), false);
        addXp(2);
        setStreak((s) => {
          setBestStreak((b) => Math.max(b, s + 1));
          return s + 1;
        });
      }
    },
    [q, picked, srs, saveCard, addXp],
  );

  const next = useCallback(() => {
    setPicked(null);
    setTyped("");
    if (index + 1 < questions.length) setIndex(index + 1);
    else if (pool.length >= 5) {
      setMatchCards(shuffle(pool).slice(0, 5));
      setStage("match");
    } else setStage("done");
  }, [index, questions.length, pool.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stage !== "questions" || !q) return;
      if (picked !== null && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        next();
        return;
      }
      if (picked === null && q.kind !== "type") {
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) answer(q.options[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, q, picked, answer, next]);

  useEffect(() => {
    if (stage === "done") {
      const score = results.filter((r) => r.ok).length / Math.max(1, results.length);
      if (score >= 0.8) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }, [stage, results]);

  function restart(cards: VocabCard[]) {
    setQuestions(buildQuestions(cards.length >= 1 ? cards : pool, distractors, Math.min(LENGTH, Math.max(cards.length, 1))));
    setIndex(0);
    setPicked(null);
    setTyped("");
    setResults([]);
    setStreak(0);
    setStage("questions");
    setRound((r) => r + 1);
  }

  if (pool.length < 2) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-display text-3xl font-bold">Not enough words to quiz yet</p>
          <p className="mt-2 text-muted">Study a few cards first, then come back.</p>
          <Link to="/cards" className="btn btn-primary mt-6">
            Back to cards
          </Link>
        </div>
      </div>
    );
  }

  const correct = results.filter((r) => r.ok).length;
  const missed = results.filter((r) => !r.ok).map((r) => r.card);
  const ok = picked !== null && results[results.length - 1]?.ok;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 pt-5 md:pt-8">
        <button aria-label="Quit quiz" onClick={() => navigate("/cards")} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
          <X size={24} />
        </button>
        <ProgressBar value={stage === "questions" ? index / questions.length : 1} className="h-4" color="var(--color-plum)" />
        <AnimatePresence>
          {streak >= 2 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1 font-bold text-ember">
              <Flame size={18} fill="currentColor" />
              {streak}
            </motion.span>
          )}
        </AnimatePresence>
      </header>
      <p className="mx-auto mt-3 w-full max-w-3xl px-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Quiz · {title}</p>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
        {stage === "questions" && q && (
          <AnimatePresence mode="wait">
            <motion.div key={`${round}-${index}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
              <QuestionView q={q} picked={picked} typed={typed} setTyped={setTyped} onAnswer={answer} />
            </motion.div>
          </AnimatePresence>
        )}
        {stage === "match" && <MatchRound cards={matchCards} onDone={(time) => { addXp(time < 20 ? 6 : 3); setStage("done"); }} />}
        {stage === "done" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto w-full max-w-lg text-center">
            <div className="flex justify-center">
              <Ring value={correct / Math.max(1, results.length)} size={140} stroke={12} color={scoreColor((correct / Math.max(1, results.length)) * 100)}>
                <div>
                  <p className="font-display text-4xl font-extrabold">
                    {correct}/{results.length}
                  </p>
                  <p className="text-xs text-muted">correct</p>
                </div>
              </Ring>
            </div>
            <p className="mt-4 font-display text-3xl font-extrabold">{correct === results.length ? "Flawless!" : correct / results.length >= 0.7 ? "Nice work!" : "Keep at it!"}</p>
            <p className="mt-1 flex items-center justify-center gap-4 text-muted">
              <span className="flex items-center gap-1">
                <Flame size={15} className="text-ember" /> best streak {bestStreak}
              </span>
              <span className="flex items-center gap-1">
                <Zap size={15} className="text-gold" /> +{correct * 2} XP
              </span>
            </p>
            {missed.length > 0 && (
              <div className="card mt-6 p-4 text-left">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold">Words to work on</p>
                  <button
                    className="chip !bg-bad/15 !text-bad"
                    onClick={() => missed.forEach((c) => !flagged[c.id] && toggleFlag(c.id))}
                  >
                    <Flag size={12} /> Flag all
                  </button>
                </div>
                {missed.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-1.5">
                    <PlayButton text={said(c)} size="sm" />
                    <span className="font-semibold">{said(c)}</span>
                    <span className="truncate text-sm text-muted">{c.en}</span>
                    {flagged[c.id] && <Flag size={13} className="ml-auto shrink-0 text-bad" fill="currentColor" />}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3">
              {missed.length > 0 && (
                <button className="btn btn-gold w-full" onClick={() => restart(missed)}>
                  <RotateCcw size={16} /> Retry the {missed.length} I missed
                </button>
              )}
              <button className="btn btn-primary w-full" onClick={() => restart(pool)}>
                New quiz
              </button>
              <button className="btn btn-ghost w-full" onClick={() => navigate("/cards")}>
                Back to cards
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {stage === "questions" && picked !== null && (
        <footer className={clsx("sticky bottom-0 border-t", ok ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10")}>
          <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-full text-white", ok ? "bg-good" : "bg-bad")}>{ok ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}</span>
            <div className="min-w-0 flex-1">
              <p className={clsx("font-display text-xl font-bold", ok ? "text-good" : "text-bad")}>{ok ? ["Correct!", "Nice!", "Exactly!", "Great!"][index % 4] : "Not quite"}</p>
              <p className="truncate text-sm">
                <span className="font-semibold">{said(q!.card)}</span> · {q!.card.en}
              </p>
            </div>
            <button autoFocus className="btn btn-gold w-40" onClick={next}>
              Continue
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

const PROMPT: Record<Kind, string> = {
  meaning: "What does this mean?",
  recall: "How do you say this in German?",
  article: "Which article?",
  listen: "Which word did you hear?",
  type: "Type it in German",
};

function QuestionView({
  q,
  picked,
  typed,
  setTyped,
  onAnswer,
}: {
  q: Question;
  picked: string | null;
  typed: string;
  setTyped: (s: string) => void;
  onAnswer: (v: string) => void;
}) {
  const locked = picked !== null;
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-plum">{PROMPT[q.kind]}</p>
      <div className="mt-5 flex min-h-28 items-center gap-4">
        {q.kind === "meaning" && (
          <>
            <PlayButton text={said(q.card)} size="lg" />
            <p className="font-display text-5xl font-extrabold tracking-tight">{q.card.de}</p>
          </>
        )}
        {(q.kind === "recall" || q.kind === "type") && <p className="font-display text-4xl font-extrabold tracking-tight">{q.card.en}</p>}
        {q.kind === "article" && (
          <div className="flex items-center gap-4">
            <span className="grid h-16 min-w-24 place-items-center rounded-2xl border-4 border-dashed border-line px-3 font-display text-3xl font-extrabold text-muted">
              {locked ? q.answer : "___"}
            </span>
            <p className="font-display text-5xl font-extrabold tracking-tight">{q.card.de}</p>
          </div>
        )}
        {q.kind === "listen" && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => speak(said(q.card))}
            className="grid h-24 w-24 place-items-center rounded-full bg-plum text-white shadow-xl"
            aria-label="Play again"
          >
            <Volume2 size={40} />
          </motion.button>
        )}
      </div>
      {q.kind === "article" && <p className="text-muted">{q.card.en}</p>}

      {q.kind === "type" ? (
        <div className="mt-8">
          <input
            autoFocus
            disabled={locked}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              if (typed.trim() && !locked) onAnswer(typed);
            }}
            lang="de"
            spellCheck={false}
            placeholder="Type the German word…"
            className={clsx(
              "w-full rounded-2xl border-2 bg-surface p-4 text-2xl font-semibold outline-none",
              !locked && "border-line focus:border-plum",
              locked && (picked !== null && normalizeAnswer(typed) === normalizeAnswer(q.answer) ? "border-good" : "border-bad"),
            )}
          />
          {locked && normalizeAnswer(typed) !== normalizeAnswer(q.answer) && (
            <p className="mt-2 text-lg">
              Answer: <span className="font-bold">{q.answer}</span>
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {["ä", "ö", "ü", "ß"].map((ch) => (
              <button key={ch} disabled={locked} onClick={() => setTyped(typed + ch)} className="btn btn-ghost h-10 w-10 !p-0 text-lg">
                {ch}
              </button>
            ))}
            <button disabled={locked || !typed.trim()} onClick={() => onAnswer(typed)} className="btn btn-gold ml-auto">
              Check
            </button>
          </div>
        </div>
      ) : (
        <div className={clsx("mt-8 grid gap-3", q.kind === "article" ? "grid-cols-3" : "sm:grid-cols-2")}>
          {q.options.map((o, i) => {
            const state = !locked ? "idle" : o === q.answer ? "right" : o === picked ? "wrong" : "dim";
            const articleTone = q.kind === "article" ? { der: "var(--color-der)", die: "var(--color-die)", das: "var(--color-das)" }[o] : undefined;
            return (
              <motion.button
                key={o + i}
                whileTap={{ scale: 0.97 }}
                animate={state === "wrong" ? { x: [0, -8, 8, -5, 5, 0] } : {}}
                transition={{ duration: 0.35 }}
                disabled={locked}
                onClick={() => onAnswer(o)}
                className={clsx(
                  "flex items-center gap-3 rounded-2xl border-2 p-4 text-left text-lg font-semibold transition-colors",
                  state === "idle" && "border-line bg-surface hover:border-plum",
                  state === "right" && "border-good bg-good/15",
                  state === "wrong" && "border-bad bg-bad/15",
                  state === "dim" && "border-line bg-surface opacity-50",
                  q.kind === "article" && "justify-center py-6 font-display text-2xl",
                )}
                style={articleTone && state === "idle" ? { borderColor: articleTone, color: articleTone } : undefined}
              >
                {q.kind !== "article" && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-line text-xs text-muted">{i + 1}</span>}
                {o}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchRound({ cards, onDone }: { cards: VocabCard[]; onDone: (seconds: number) => void }) {
  const left = useMemo(() => shuffle(cards), [cards]);
  const right = useMemo(() => shuffle(cards), [cards]);
  const [sel, setSel] = useState<{ side: "l" | "r"; id: string } | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (done.length === cards.length) {
      const t = setTimeout(() => onDone((Date.now() - start) / 1000), 500);
      return () => clearTimeout(t);
    }
  }, [done.length, cards.length, onDone, start]);

  function pick(side: "l" | "r", id: string) {
    if (done.includes(id)) return;
    if (side === "l") speak(said(cards.find((c) => c.id === id)!));
    if (!sel || sel.side === side) return setSel({ side, id });
    if (sel.id === id) setDone((d) => [...d, id]);
    else {
      setWrong([sel.id + sel.side, id + side]);
      setTimeout(() => setWrong([]), 450);
    }
    setSel(null);
  }

  const tile = (side: "l" | "r", c: VocabCard) => {
    const isDone = done.includes(c.id);
    const isSel = sel?.side === side && sel.id === c.id;
    const isWrong = wrong.includes(c.id + side);
    return (
      <motion.button
        key={c.id + side}
        layout
        disabled={isDone}
        animate={isWrong ? { x: [0, -8, 8, -5, 5, 0] } : isDone ? { scale: 0.92, opacity: 0.35 } : {}}
        onClick={() => pick(side, c.id)}
        className={clsx(
          "rounded-2xl border-2 p-4 text-lg font-semibold",
          isDone && "border-good/40 bg-good/10",
          !isDone && isSel && "border-plum bg-plum/10",
          !isDone && !isSel && isWrong && "border-bad bg-bad/10",
          !isDone && !isSel && !isWrong && "border-line bg-surface hover:border-plum",
        )}
      >
        {side === "l" ? said(c) : c.en}
      </motion.button>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-plum">Bonus round · match them all</p>
        <span className="flex items-center gap-1 font-display text-xl font-bold">
          <Timer size={18} /> {((now - start) / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="grid gap-3">{left.map((c) => tile("l", c))}</div>
        <div className="grid gap-3">{right.map((c) => tile("r", c))}</div>
      </div>
    </div>
  );
}
