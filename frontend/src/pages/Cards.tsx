import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Flag, Layers, Undo2 } from "lucide-react";
import { decks, withArticle } from "@/data/content";
import { Sheet } from "@/components/Sheet";
import { today, useStore } from "@/lib/store";
import { allCards, buildQueue, deckStats, TUTOR_DECK } from "@/lib/srs";
import { DECK_ICONS, PageHeader, ProgressBar } from "@/components/ui";

const TINTS = ["#ffcc33", "#ff5a3c", "#3b82f6", "#10b981", "#a855f7", "#f43f5e"];

export default function Cards() {
  const srs = useStore((s) => s.srs);
  const settings = useStore((s) => s.settings);
  const introduced = useStore((s) => s.newIntroduced[today()] ?? 0);
  const newLeft = Math.max(0, settings.newPerDay - introduced);
  const customCount = useStore((s) => s.customWords.length);
  const known = useStore((s) => s.known);
  const flagged = useStore((s) => s.flagged);
  const unmarkKnown = useStore((s) => s.unmarkKnown);
  const [showKnown, setShowKnown] = useState(false);
  const knownIds = Object.keys(known);
  const flaggedCount = Object.keys(flagged).filter((id) => !known[id]).length;
  const queue = useMemo(() => buildQueue(srs, { newLimit: newLeft }), [srs, newLeft, customCount, known]);
  const knownCards = useMemo(() => {
    const byId = new Map(allCards().map((c) => [c.id, c]));
    return knownIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c).sort((a, b) => known[b.id] - known[a.id]);
  }, [knownIds.length, known]);

  return (
    <div>
      <PageHeader eyebrow="Flashcards" title="Words that stick">
        Spaced repetition shows each word right before you'd forget it. Grade yourself honestly and the schedule adapts to your memory.
      </PageHeader>

      <Link to="/cards/review" className="hero hero-sky group relative mb-10 flex items-center gap-6 overflow-hidden rounded-[2rem] p-7">
        <div className="absolute -right-6 -top-10 h-48 w-48 rounded-full bg-der/40 blur-3xl" />
        <div className="relative flex h-24 w-20 shrink-0 items-center justify-center">
          {[2, 1, 0].map((i) => (
            <motion.div
              key={i}
              className="absolute h-24 w-16 rounded-xl border-2 border-white/20 bg-white/10"
              animate={{ rotate: (i - 1) * 8, x: (i - 1) * 6 }}
              whileHover={{ rotate: (i - 1) * 14 }}
            />
          ))}
          <Layers className="relative" size={28} />
        </div>
        <div className="relative flex-1">
          <p className="font-display text-3xl font-extrabold">Daily review</p>
          <p className="text-white/70">
            {queue.length ? `${queue.length} cards across all decks, ${newLeft} new allowed today` : "All caught up. Come back later or learn new words."}
          </p>
        </div>
        <ArrowRight className="relative shrink-0 transition-transform group-hover:translate-x-1" />
      </Link>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Link
          to={flaggedCount ? "/cards/flagged" : "#"}
          onClick={(e) => !flaggedCount && e.preventDefault()}
          className={`card group flex items-center gap-4 p-5 transition-all ${flaggedCount ? "hover:-translate-y-1" : "opacity-70"}`}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bad/15 text-bad">
            <Flag size={22} fill="currentColor" />
          </span>
          <div className="flex-1">
            <p className="font-display text-lg font-bold">Flagged words · {flaggedCount}</p>
            <p className="text-sm text-muted">{flaggedCount ? "Drill just your difficult words, as often as you like." : "Flag a hard word on any card to practise it here."}</p>
          </div>
          {flaggedCount > 0 && <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" />}
        </Link>
        <button onClick={() => setShowKnown(true)} disabled={!knownIds.length} className="card group flex items-center gap-4 p-5 text-left transition-all enabled:hover:-translate-y-1 disabled:opacity-70">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-das/15 text-das">
            <CheckCircle2 size={22} />
          </span>
          <div className="flex-1">
            <p className="font-display text-lg font-bold">Known words · {knownIds.length}</p>
            <p className="text-sm text-muted">{knownIds.length ? "These no longer appear as cards. Tap to review or undo." : "Mark words you already know and they stop appearing."}</p>
          </div>
        </button>
      </div>

      <Sheet open={showKnown} onClose={() => setShowKnown(false)}>
        <h2 className="font-display text-2xl font-extrabold">Known words</h2>
        <p className="mt-1 text-sm text-muted">They still show up in lessons and sentences, just not as flashcards.</p>
        <div className="mt-5 divide-y divide-line">
          {knownCards.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{withArticle(c)}</p>
                <p className="truncate text-sm text-muted">{c.en}</p>
              </div>
              <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => unmarkKnown(c.id)}>
                <Undo2 size={13} /> Undo
              </button>
            </div>
          ))}
        </div>
      </Sheet>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...(customCount ? [{ id: TUTOR_DECK, level: "Tutor", title: "Saved from your tutor chats", titleDe: "Meine Wörter", icon: "sparkles", words: [] }] : []), ...decks].map((deck, i) => {
          const s = deckStats(srs, deck.id);
          const Icon = DECK_ICONS[deck.icon] ?? Layers;
          const tint = TINTS[i % TINTS.length];
          const seen = s.total - s.fresh;
          return (
            <motion.div key={deck.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to={`/cards/${deck.id}`} className="card group flex h-full flex-col p-5 transition-all hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}>
                    <Icon size={22} />
                  </span>
                  {s.due > 0 && <span className="chip !bg-ember !text-white">{s.due} due</span>}
                </div>
                <p className="mt-4 font-display text-xl font-bold">{deck.title}</p>
                <p className="text-sm text-muted">
                  {deck.titleDe} · {deck.level}
                </p>
                <div className="mt-auto pt-5">
                  <ProgressBar value={seen / s.total} color={tint} className="h-2" />
                  <p className="mt-2 text-xs text-muted">
                    {seen}/{s.total} learned · {s.mastered} mastered
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
