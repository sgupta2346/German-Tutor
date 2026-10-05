import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import clsx from "clsx";
import confetti from "canvas-confetti";
import { ArrowRight, Mic, RotateCcw, X } from "lucide-react";
import { Rating, type Grade } from "ts-fsrs";
import { deckById, withArticle } from "@/data/content";
import type { VocabCard } from "@/data/types";
import { speak } from "@/lib/audio";
import { today, useStore } from "@/lib/store";
import { buildQueue, GRADES, isNew, preview, review, TUTOR_DECK } from "@/lib/srs";
import { PlayButton, ProgressBar } from "@/components/ui";
import { SpeakPanel } from "@/components/SpeakPanel";
import { Sheet } from "@/components/Sheet";

const SWIPE = 110;

export default function CardSession() {
  const { deckId = "review" } = useParams();
  const navigate = useNavigate();
  const deck = deckId === "review" ? null : deckId === TUTOR_DECK ? { id: TUTOR_DECK, title: "Saved words", titleDe: "Meine Wörter" } : deckById.get(deckId);
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

  const spoken = card ? (card.gender ? withArticle(card) : card.de) : "";
  const practicePanel = card && (
    <>
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-ember">Say it out loud</p>
      <div className="mt-3 flex items-center gap-3">
        <PlayButton text={spoken} />
        <div>
          <p className="font-display text-2xl font-extrabold lg:text-3xl">{spoken}</p>
          <p className="text-muted">{card.en}</p>
        </div>
      </div>
      <div className="mt-5">
        <SpeakPanel text={spoken} compact />
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col overflow-hidden lg:h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 pt-5 md:pt-6">
        <button aria-label="Close" onClick={() => navigate("/cards")} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
          <X size={24} />
        </button>
        <ProgressBar value={total.current ? reviewed / total.current : 1} className="h-3" color="var(--color-das)" />
        <span className="w-10 text-right text-sm font-bold text-muted lg:hidden">{queue.length}</span>
      </header>
      <p className="mx-auto mt-3 w-full max-w-6xl px-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted lg:hidden">
        {deck ? `${deck.title} · ${deck.titleDe}` : "Daily review"}
      </p>

      {done ? (
        <Summary reviewed={reviewed} tally={tally} onAgain={() => navigate(0)} onBack={() => navigate("/cards")} />
      ) : (
        <>
          <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 pt-4 lg:min-h-0 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:pb-6 lg:pt-2">
            <aside className="hidden flex-col gap-4 lg:flex">
              <div className="card p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{deck ? deck.titleDe : "Daily review"}</p>
                <p className="mt-1 font-display text-2xl font-extrabold">{deck ? deck.title : "All decks"}</p>
                <div className="mt-6 flex items-end gap-6">
                  <div>
                    <p className="font-display text-4xl font-extrabold">{queue.length}</p>
                    <p className="text-xs text-muted">cards left</p>
                  </div>
                  <div>
                    <p className="font-display text-4xl font-extrabold">{reviewed}</p>
                    <p className="text-xs text-muted">reviewed</p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-4 gap-2 text-center">
                  {GRADES.map(({ grade: g, label, tone }) => (
                    <div key={label} className="rounded-xl bg-raised py-2">
                      <p className="font-display text-lg font-extrabold" style={{ color: tone }}>
                        {tally[g] ?? 0}
                      </p>
                      <p className="text-[10px] font-semibold text-muted">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-5 text-sm text-muted">
                <p className="mb-2 font-semibold text-ink">Shortcuts</p>
                <p>
                  <kbd className="rounded bg-raised px-1.5 font-mono">space</kbd> flip · <kbd className="rounded bg-raised px-1.5 font-mono">1</kbd>–<kbd className="rounded bg-raised px-1.5 font-mono">4</kbd> grade
                </p>
                <p className="mt-1">
                  <kbd className="rounded bg-raised px-1.5 font-mono">←</kbd> again · <kbd className="rounded bg-raised px-1.5 font-mono">→</kbd> got it · <kbd className="rounded bg-raised px-1.5 font-mono">↑</kbd> easy
                </p>
                <p className="mt-1">or just drag the card</p>
              </div>
            </aside>

            <div className="flex justify-center">
              <div className="relative aspect-[3/4] w-[min(24rem,calc((100dvh-15rem)*0.75),100%)] lg:w-[min(26rem,calc((100dvh-9rem)*0.75))]">
                {queue
                  .slice(1, 3)
                  .map((c, i) => <StackCard key={`${c.id}-behind-${i}`} card={c} depth={i + 1} />)
                  .reverse()}
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

            <div className="hidden lg:block">
              <AnimatePresence mode="wait">
                {!flipped ? (
                  <motion.div key="hint" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="card p-6">
                    <p className="font-display text-xl font-bold">Do you know it?</p>
                    <p className="mt-1 text-sm text-muted">Say the meaning in your head, then check.</p>
                    <button className="btn btn-primary mt-5 w-full" onClick={() => setFlipped(true)}>
                      Show answer <kbd className="ml-1 rounded bg-white/20 px-1.5 text-xs">space</kbd>
                    </button>
                  </motion.div>
                ) : practice ? (
                  <motion.div key="practice" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="card relative max-h-[calc(100dvh-8rem)] overflow-y-auto p-6">
                    <button aria-label="Close practice" onClick={() => setPractice(false)} className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-raised hover:text-ink">
                      <X size={18} />
                    </button>
                    {practicePanel}
                  </motion.div>
                ) : (
                  <motion.div key="grades" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="card space-y-3 p-6">
                    <p className="font-display text-xl font-bold">How well did you know it?</p>
                    <GradeBar card={card} onGrade={grade} vertical />
                    <button className="btn btn-ghost w-full text-sm" onClick={() => setPractice(true)}>
                      <Mic size={15} /> Practise saying it
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 lg:hidden">
            <AnimatePresence mode="wait">
              {flipped ? (
                <GradeBar key="grades" card={card} onGrade={grade} />
              ) : (
                <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center">
                  <button className="btn btn-primary w-full max-w-sm" onClick={() => setFlipped(true)}>
                    Show answer <kbd className="ml-1 rounded bg-white/20 px-1.5 text-xs">space</kbd>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="lg:hidden">
            <Sheet open={practice} onClose={() => setPractice(false)}>
              <div className="pr-10">{practicePanel}</div>
            </Sheet>
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

const FACE: Record<string, [string, string]> = {
  m: ["#3b82f6", "#6366f1"],
  f: ["#f43f5e", "#ec4899"],
  n: ["#10b981", "#0d9488"],
  pl: ["#a855f7", "#7c3aed"],
  none: ["#f59e0b", "#f97316"],
};

function faceOf(card: VocabCard): [string, string] {
  return FACE[card.gender ?? "none"];
}

function StackCard({ card, depth }: { card: VocabCard; depth: number }) {
  const [a, b] = faceOf(card);
  return (
    <motion.div
      className="absolute inset-0 rounded-[28px] border-4 border-white/70"
      style={{ background: `linear-gradient(145deg, ${a}, ${b})`, boxShadow: "0 18px 40px -18px rgba(31,27,69,.45)" }}
      initial={false}
      animate={{ scale: 1 - depth * 0.05, y: depth * 22, rotate: depth % 2 ? -4 : 3, opacity: 1 - depth * 0.18 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    />
  );
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
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const flip = useMotionValue(0);
  const tiltX = useSpring(useTransform(py, [0, 1], [10, -10]), { stiffness: 220, damping: 20 });
  const tiltY = useSpring(useTransform(px, [0, 1], [-12, 12]), { stiffness: 220, damping: 20 });
  const rotateY = useTransform(() => flip.get() + (flip.get() > 90 ? -tiltY.get() : tiltY.get()));
  const rotate = useTransform(x, [-300, 0, 300], [-20, 0, 20]);
  const glareX = useTransform(px, (v) => v * 100);
  const glareY = useTransform(py, (v) => v * 100);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,.45), transparent 55%)`;
  const againOpacity = useTransform(x, [-SWIPE, -30], [1, 0]);
  const goodOpacity = useTransform(x, [30, SWIPE], [0, 1]);
  const easyOpacity = useTransform(y, [-SWIPE, -30], [1, 0]);
  const [a, b] = faceOf(card);
  const spoken = card.gender ? withArticle(card) : card.de;
  const article = card.gender ? withArticle(card).split(" ")[0] : null;

  useEffect(() => {
    const controls = animate(flip, flipped ? 180 : 0, { type: "spring", stiffness: 180, damping: 18 });
    return () => controls.stop();
  }, [flipped, flip]);

  async function fly(g: Grade, to: { x: number; y: number }) {
    await Promise.all([animate(x, to.x, { duration: 0.32, ease: "easeIn" }), animate(y, to.y, { duration: 0.32, ease: "easeIn" })]);
    onGrade(g);
  }

  function track(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }

  function rest() {
    px.set(0.5);
    py.set(0.5);
  }

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ x, y, rotate, perspective: 1100 }}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      whileTap={{ scale: 1.03 }}
      drag
      dragSnapToOrigin
      dragElastic={0.75}
      dragTransition={{ bounceStiffness: 320, bounceDamping: 18 }}
      onPointerMove={track}
      onPointerLeave={rest}
      onDragEnd={(_, info) => {
        const dx = info.offset.x + info.velocity.x * 0.15;
        const dy = info.offset.y + info.velocity.y * 0.15;
        if (!flipped) {
          if (Math.abs(dx) > SWIPE || dy < -SWIPE) onFlip();
          return;
        }
        if (dx > SWIPE) fly(Rating.Good, { x: 760, y: info.offset.y + 80 });
        else if (dx < -SWIPE) fly(Rating.Again, { x: -760, y: info.offset.y + 80 });
        else if (dy < -SWIPE) fly(Rating.Easy, { x: info.offset.x, y: -1000 });
      }}
    >
      <motion.div className="preserve-3d relative h-full w-full" style={{ rotateX: tiltX, rotateY }} onTap={() => !flipped && onFlip()}>
        <div
          className="backface-hidden absolute inset-0 flex flex-col overflow-hidden rounded-[28px] border-4 border-white/80 text-white"
          style={{ background: `linear-gradient(145deg, ${a}, ${b})`, boxShadow: "0 30px 60px -24px rgba(31,27,69,.55)" }}
        >
          <span className="pointer-events-none absolute -right-6 -top-10 font-display text-[11rem] font-extrabold leading-none text-white/10">{article ?? "Aa"}</span>
          <span className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-white/10" />
          <div className="relative flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
            {article && <span className="rounded-full bg-white/25 px-4 py-1 text-sm font-bold tracking-wide">{article}</span>}
            <p className="font-display text-5xl font-extrabold tracking-tight text-balance break-words drop-shadow-sm md:text-6xl">{card.de}</p>
            <div className="flex gap-2" onPointerDownCapture={stop}>
              <PlayButton text={spoken} className="!bg-white/25 !text-white hover:!bg-white/40" />
              <PlayButton text={spoken} slow className="!bg-white/25 !text-white hover:!bg-white/40" />
            </div>
          </div>
          <p className="relative pb-6 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white/80">tap or swipe to flip</p>
          <motion.div className="pointer-events-none absolute inset-0" style={{ background: glare }} />
        </div>

        <div
          className="backface-hidden absolute inset-0 flex flex-col overflow-hidden rounded-[28px] border-4 bg-surface [transform:rotateY(180deg)]"
          style={{ borderColor: a, boxShadow: "0 30px 60px -24px rgba(31,27,69,.55)" }}
        >
          <div className="px-7 pb-5 pt-6 text-white" style={{ background: `linear-gradient(145deg, ${a}, ${b})` }}>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/25 px-3 py-0.5 text-xs font-bold">{card.pos}</span>
              <button
                onPointerDownCapture={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  onPractice();
                }}
                className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold"
                style={{ color: a }}
              >
                <Mic size={13} /> Say it
              </button>
            </div>
            <p className="mt-4 font-display text-2xl font-bold">{withArticle(card)}</p>
          </div>
          <div className="flex flex-1 flex-col p-5 md:p-6">
            <div className="flex flex-1 flex-col justify-center">
              <p className="font-display text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{card.en}</p>
              {card.plural && (
                <p className="mt-3 text-sm text-muted">
                  Plural: <span className="font-semibold text-plural">die {card.plural}</span>
                </p>
              )}
            </div>
            <div className="rounded-2xl p-4" style={{ background: `${a}18` }} onPointerDownCapture={stop}>
              <div className="flex items-start gap-3">
                <PlayButton text={card.ex.de} size="sm" />
                <div>
                  <p className="font-semibold">{card.ex.de}</p>
                  <p className="text-sm text-muted">{card.ex.en}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2" onPointerDownCapture={stop}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fly(Rating.Again, { x: -760, y: 80 });
                }}
                className="rounded-2xl border-2 border-bad/40 py-3 font-semibold text-bad transition-colors hover:bg-bad/10"
              >
                Didn't know
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fly(Rating.Good, { x: 760, y: 80 });
                }}
                className="flex items-center justify-center gap-1 rounded-2xl py-3 font-semibold text-white shadow-md transition-transform active:scale-95"
                style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
              >
                Got it <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {flipped && (
        <>
          <motion.span style={{ opacity: againOpacity }} className="pointer-events-none absolute left-6 top-8 -rotate-12 rounded-xl border-4 border-bad bg-white/90 px-3 py-1 font-display text-2xl font-extrabold text-bad">
            AGAIN
          </motion.span>
          <motion.span style={{ opacity: goodOpacity }} className="pointer-events-none absolute right-6 top-8 rotate-12 rounded-xl border-4 border-good bg-white/90 px-3 py-1 font-display text-2xl font-extrabold text-good">
            GOOD
          </motion.span>
          <motion.span style={{ opacity: easyOpacity }} className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto w-fit rounded-xl border-4 border-der bg-white/90 px-3 py-1 font-display text-2xl font-extrabold text-der">
            EASY
          </motion.span>
        </>
      )}
    </motion.div>
  );
}

function GradeBar({ card, onGrade, vertical = false }: { card: VocabCard; onGrade: (g: Grade) => void; vertical?: boolean }) {
  const srs = useStore((s) => s.srs);
  const intervals = useMemo(() => preview(srs[card.id]), [srs, card.id]);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={vertical ? "grid gap-2" : "grid grid-cols-4 gap-2"}>
      {GRADES.map(({ grade, label, tone, key }) => (
        <motion.button
          key={label}
          whileTap={{ scale: 0.94 }}
          onClick={() => onGrade(grade)}
          className={vertical ? "flex items-center justify-between rounded-2xl border-2 bg-surface px-5 py-3 font-semibold" : "flex flex-col items-center rounded-2xl border-2 bg-surface py-3 font-semibold"}
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
            <h1 className="font-display text-5xl font-extrabold">Session done!</h1>
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
