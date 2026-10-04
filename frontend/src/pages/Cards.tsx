import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Layers } from "lucide-react";
import { decks } from "@/data/content";
import { today, useStore } from "@/lib/store";
import { buildQueue, deckStats, TUTOR_DECK } from "@/lib/srs";
import { DECK_ICONS, PageHeader, ProgressBar } from "@/components/ui";

const TINTS = ["#ffcc33", "#ff5a3c", "#3b82f6", "#10b981", "#a855f7", "#f43f5e"];

export default function Cards() {
  const srs = useStore((s) => s.srs);
  const settings = useStore((s) => s.settings);
  const introduced = useStore((s) => s.newIntroduced[today()] ?? 0);
  const newLeft = Math.max(0, settings.newPerDay - introduced);
  const customCount = useStore((s) => s.customWords.length);
  const queue = useMemo(() => buildQueue(srs, { newLimit: newLeft }), [srs, newLeft, customCount]);

  return (
    <div>
      <PageHeader eyebrow="Karteikarten" title="Words that stick">
        Spaced repetition shows each word right before you'd forget it. Grade yourself honestly and the schedule adapts to your memory.
      </PageHeader>

      <Link to="/cards/review" className="hero group relative mb-10 flex items-center gap-6 overflow-hidden rounded-[2rem] p-7">
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
                <p className="mt-4 font-display text-xl font-bold">{deck.titleDe}</p>
                <p className="text-sm text-muted">
                  {deck.title} · {deck.level}
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
