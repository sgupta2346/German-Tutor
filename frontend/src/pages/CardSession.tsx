import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import clsx from "clsx";
import confetti from "canvas-confetti";
import { Mic, RotateCcw, X } from "lucide-react";
import { Rating, type Grade } from "ts-fsrs";
import { deckById, GENDER_COLOR, withArticle } from "@/data/content";
import type { VocabCard } from "@/data/types";
import { speak } from "@/lib/audio";
import { today, useStore } from "@/lib/store";
import { buildQueue, GRADES, isNew, preview, review } from "@/lib/srs";
import { GenderTag, PlayButton, ProgressBar } from "@/components/ui";
import { SpeakPanel } from "@/components/SpeakPanel";

const SWIPE = 110;

export default function CardSession() {
  const { deckId = "review" } = useParams();
  const navigate = useNavigate();
  const deck = deckId === "review" ? null : deckById.get(deckId);
  const srs = useStore((s) => s.srs);
  const saveCard = useStore((s) => s.saveCard);
  const addXp = useStore((s) => s.addXp);
  const newPerDay = useStore((s) => s.settings.newPerDay);
  const introduced = useStore((s) => s.newIntroduced[today()] ?? 0);
  const autoplay = useStore((s) => s.settings.autoplay);

  const [queue, setQueue] = useState<VocabCard[]>(() =>
    buildQueue(useStore.getState().srs, {
      deckId: deck?.id,
      newLimit: deck ? Math.max(5, newPerDay - introduced) : Math.max(0, newPerDay - introduced),
    }),
  );
  const [flipped, setFlipped] = useState(false);
  const [practice, setPractice] = useState(false);
  const [tally, setTally] = useState<Record<number, number>>({});
  const [reviewed, setReviewed] = useState(0);
  const total = useRef(queue.length);

  const card = queue[0];
  const done = !card;

  useEffect(() => {
    if (card && autoplay) speak(card.gender ? withArticle(card) : card.de);
  }, [card, autoplay]);

  useEffect(() => {
    if (done && reviewed > 0) confetti({ particleCount: 120, spread: 75, origin: { y: 0.55 }, colors: ["#ffcc33", "#ff5a3c", "#3b82f6", "#10b981"] });
  }, [done, reviewed]);

  const grade = useCallback(
    (g: Grade) => {
      if (!card) return;
      const stored = srs[card.id];
      const next = review(stored, g);
      saveCard(card.id, next, isNew(stored));
      setTally((t) => ({ ...t, [g]: (t[g] ?? 0) + 1 }));
      setReviewed((r) => r + 1);
      addXp(g === Rating.Again ? 1 : 2);
      setFlipped(false);
      setPractice(false);
      setQueue((q) => {
        const rest = q.slice(1);
        if (g === Rating.Again) {
          total.current += 1;
          const at = Math.min(rest.length, 3);
          return [...rest.slice(0, at), card, ...rest.slice(at)];
        }
        return rest;
      });
    },
    [card, srs, saveCard, addXp],
  );

  if (!deck && deckId !== "review") {
    return (
      <div className="grid min-h-screen place-items-center">
        <Link to="/cards" className="btn btn-primary">
          Deck not found, back to decks
        </Link>
      </div>
    );
  }

  return (
    <div className="glow-bg flex min-h-screen flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 pt-5 md:pt-8">
        <button aria-label="Close" onClick={() => navigate("/cards")} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
          <X size={24} />
        </button>
        <ProgressBar value={total.current ? reviewed / total.current : 1} className="h-3" color="var(--color-der)" />
        <span className="w-10 text-right text-sm font-bold text-muted">{queue.length}</span>
      </header>
      <p className="mx-auto mt-3 w-full max-w-2xl px-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {deck ? `${deck.titleDe} · ${deck.title}` : "Daily review"}
      </p>

      {done ? (
        <Summary reviewed={reviewed} tally={tally} onAgain={() => navigate(0)} onBack={() => navigate("/cards")} />
      ) : (
        <>
          <div className="relative mx-auto mt-6 flex w-full max-w-md flex-1 items-start justify-center px-6 md:mt-10">
            <div className="relative aspect-[3/4] w-full max-w-sm">
              {queue.slice(1, 3).map((c, i) => (
                <motion.div
                  key={`${c.id}-behind-${i}`}
                  className="absolute inset-0 rounded-3xl border border-line bg-raised shadow-lg"
                  initial={false}
                  animate={{ scale: 1 - (i + 1) * 0.05, y: (i + 1) * 30, opacity: 1 - (i + 1) * 0.3 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              ))}
              <AnimatePresence>
                <SwipeCard
                  key={`${card.id}-${reviewed}`}
                  card={card}
                  flipped={flipped}
                  onFlip={() => setFlipped((f) => !f)}
                  onGrade={grade}
                  onPractice={() => setPractice(true)}
                />
              </AnimatePresence>
            </div>
          </div>

          <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6">
            <AnimatePresence mode="wait">
              {practice && flipped ? (
                <motion.div key="practice" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-5">
                  <SpeakPanel text={card.de} compact />
                </motion.div>
              ) : flipped ? (
                <GradeBar key="grades" card={card} onGrade={grade} />
              ) : (
                <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center">
                  <button className="btn btn-primary w-full max-w-sm" onClick={() => setFlipped(true)}>
                    Show answer <kbd className="ml-1 rounded bg-bg/20 px-1.5 text-xs">space</kbd>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Keys flipped={flipped} onFlip={() => setFlipped((f) => !f)} onGrade={grade} />
        </>
      )}
    </div>
  );
}

function Keys({ flipped, onFlip, onGrade }: { flipped: boolean; onFlip: () => void; onGrade: (g: Grade) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        if (!flipped) onFlip();
        else if (e.key === "Enter") onGrade(Rating.Good);
        return;
      }
      if (!flipped) return;
      const g = GRADES.find((x) => x.key === e.key);
      if (g) onGrade(g.grade);
      if (e.key === "ArrowLeft") onGrade(Rating.Again);
      if (e.key === "ArrowRight") onGrade(Rating.Good);
      if (e.key === "ArrowUp") onGrade(Rating.Easy);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, onFlip, onGrade]);
  return null;
}

function SwipeCard({
  card,
  flipped,
  onFlip,
  onGrade,
  onPractice,
}: {
  card: VocabCard;
  flipped: boolean;
  onFlip: () => void;
  onGrade: (g: Grade) => void;
  onPractice: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const againOpacity = useTransform(x, [-SWIPE, -30], [1, 0]);
  const goodOpacity = useTransform(x, [30, SWIPE], [0, 1]);
  const easyOpacity = useTransform(y, [-SWIPE, -30], [1, 0]);
  const accent = card.gender ? GENDER_COLOR[card.gender] : "var(--color-gold)";

  async function fly(g: Grade, to: { x: number; y: number }) {
    await Promise.all([animate(x, to.x, { duration: 0.28 }), animate(y, to.y, { duration: 0.28 })]);
    onGrade(g);
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate, perspective: 1200 }}
      initial={{ scale: 0.92, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      drag={flipped}
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE) fly(Rating.Good, { x: 700, y: info.offset.y });
        else if (info.offset.x < -SWIPE) fly(Rating.Again, { x: -700, y: info.offset.y });
        else if (info.offset.y < -SWIPE) fly(Rating.Easy, { x: info.offset.x, y: -900 });
      }}
    >
      <motion.div
        className="preserve-3d relative h-full w-full"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={() => !flipped && onFlip()}
      >
        <div className="card backface-hidden absolute inset-0 flex flex-col overflow-hidden shadow-2xl">
          <div className="h-2 w-full" style={{ background: accent }} />
          <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
            {card.gender && <GenderTag gender={card.gender} className="!px-3 !py-1 !text-sm" />}
            <p className="font-display text-5xl font-extrabold tracking-tight text-balance break-words md:text-6xl" style={{ color: card.gender ? accent : undefined }}>
              {card.de}
            </p>
            <div className="flex gap-2">
              <PlayButton text={card.gender ? withArticle(card) : card.de} />
              <PlayButton text={card.gender ? withArticle(card) : card.de} slow />
            </div>
          </div>
          <p className="pb-6 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">tap to flip</p>
        </div>

        <div className="card backface-hidden absolute inset-0 flex flex-col overflow-hidden shadow-2xl [transform:rotateY(180deg)]">
          <div className="h-2 w-full" style={{ background: accent }} />
          <div className="flex flex-1 flex-col p-7">
            <div className="flex items-center justify-between">
              <span className="chip">{card.pos}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPractice();
                }}
                className="chip !bg-ember !text-white"
              >
                <Mic size={13} /> Say it
              </button>
            </div>
            <div className="flex flex-1 flex-col justify-center">
              <p className="font-display text-2xl font-bold" style={{ color: card.gender ? accent : undefined }}>
                {withArticle(card)}
              </p>
              <p className="mt-2 font-display text-4xl font-extrabold tracking-tight text-balance">{card.en}</p>
              {card.plural && (
                <p className="mt-3 text-sm text-muted">
                  Plural: <span className="font-semibold text-plural">die {card.plural}</span>
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-raised p-4">
              <div className="flex items-start gap-3">
                <PlayButton text={card.ex.de} size="sm" />
                <div>
                  <p className="font-semibold">{card.ex.de}</p>
                  <p className="text-sm text-muted">{card.ex.en}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {flipped && (
        <>
          <motion.span style={{ opacity: againOpacity }} className="pointer-events-none absolute left-6 top-8 -rotate-12 rounded-xl border-4 border-bad px-3 py-1 font-display text-2xl font-extrabold text-bad">
            AGAIN
          </motion.span>
          <motion.span style={{ opacity: goodOpacity }} className="pointer-events-none absolute right-6 top-8 rotate-12 rounded-xl border-4 border-good px-3 py-1 font-display text-2xl font-extrabold text-good">
            GOOD
          </motion.span>
          <motion.span style={{ opacity: easyOpacity }} className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto w-fit rounded-xl border-4 border-der px-3 py-1 font-display text-2xl font-extrabold text-der">
            EASY
          </motion.span>
        </>
      )}
    </motion.div>
  );
}

function GradeBar({ card, onGrade }: { card: VocabCard; onGrade: (g: Grade) => void }) {
  const srs = useStore((s) => s.srs);
  const intervals = useMemo(() => preview(srs[card.id]), [srs, card.id]);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-4 gap-2">
      {GRADES.map(({ grade, label, tone, key }) => (
        <motion.button
          key={label}
          whileTap={{ scale: 0.94 }}
          onClick={() => onGrade(grade)}
          className="flex flex-col items-center rounded-2xl border-2 bg-surface py-3 font-semibold"
          style={{ borderColor: `color-mix(in oklab, ${tone} 55%, transparent)`, boxShadow: `0 4px 0 color-mix(in oklab, ${tone} 55%, transparent)` }}
        >
          <span style={{ color: tone }}>{label}</span>
          <span className="text-xs text-muted">
            {intervals[grade]} <span className="hidden md:inline">· {key}</span>
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}

function Summary({ reviewed, tally, onAgain, onBack }: { reviewed: number; tally: Record<number, number>; onAgain: () => void; onBack: () => void }) {
  const correct = (tally[Rating.Good] ?? 0) + (tally[Rating.Easy] ?? 0) + (tally[Rating.Hard] ?? 0);
  return (
    <div className="grid flex-1 place-items-center p-6">
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md text-center">
        {reviewed ? (
          <>
            <h1 className="font-display text-5xl font-extrabold">Fertig!</h1>
            <p className="mt-2 text-muted">
              {reviewed} reviews, {Math.round((correct / reviewed) * 100)}% recalled
            </p>
            <div className="mt-8 grid grid-cols-4 gap-2">
              {GRADES.map(({ grade, label, tone }) => (
                <div key={label} className="card p-3">
                  <p className="font-display text-2xl font-extrabold" style={{ color: tone }}>
                    {tally[grade] ?? 0}
                  </p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl font-extrabold">Nothing due</h1>
            <p className="mt-2 text-muted">You're all caught up here. Pick another deck or raise your new-cards limit in settings.</p>
          </>
        )}
        <div className={clsx("mt-8 flex flex-col gap-3")}>
          <button className="btn btn-gold w-full" onClick={onBack}>
            Back to decks
          </button>
          {reviewed > 0 && (
            <button className="btn btn-ghost w-full" onClick={onAgain}>
              <RotateCcw size={16} /> Check for more
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
