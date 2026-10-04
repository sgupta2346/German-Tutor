import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowRight, Check, Sparkles, Target, X } from "lucide-react";
import { soundById } from "@/data/content";
import { useStore } from "@/lib/store";
import { diagnosticSet, drillFor, mastery, PRACTICE_RULES, tierFor, weakestSounds, type PracticeItem } from "@/lib/practice";
import { PlayButton, ProgressBar, Ring, scoreColor } from "./ui";
import { RuleTip, SpeakPanel } from "./SpeakPanel";

const TIER_LABEL = { 1: "Single words", 2: "Short sentences", 3: "Long sentences" } as const;

type Session = { rule: string | null; items: PracticeItem[]; index: number; scores: number[] };

export function WeakSoundPractice() {
  const stats = useStore((s) => s.soundStats);
  const weak = useMemo(() => weakestSounds(stats, 4), [stats]);
  const tracked = useMemo(
    () =>
      PRACTICE_RULES.map((r) => ({ rule: r, m: mastery(stats[r]), tries: stats[r]?.tries ?? 0 }))
        .filter((x) => x.tries > 0)
        .sort((a, b) => (a.m ?? 1) - (b.m ?? 1)),
    [stats],
  );
  const [session, setSession] = useState<Session | null>(null);

  if (session) return <Drill session={session} setSession={setSession} />;

  const noData = tracked.length === 0;

  return (
    <div className="space-y-6">
      {noData ? (
        <div className="hero relative overflow-hidden rounded-[2rem] p-8">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-ember/30 blur-3xl" />
          <div className="relative max-w-xl">
            <p className="chip !bg-white/10 !text-white/80">
              <Sparkles size={13} /> Personal practice
            </p>
            <h2 className="mt-4 font-display text-3xl font-extrabold">Let's find your accent</h2>
            <p className="mt-2 text-white/70">Read 8 sentences that together cover every tricky German sound. After that, practice here targets exactly the sounds you get wrong, and gets harder as you improve.</p>
            <button className="btn btn-gold mt-6" onClick={() => setSession({ rule: null, items: diagnosticSet(8), index: 0, scores: [] })}>
              Start the check <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(weak.length ? weak : tracked.slice(0, 4).map((t) => ({ rule: t.rule, mastery: t.m ?? 0, tries: t.tries }))).map((w, i) => {
              const s = soundById.get(w.rule)!;
              const tier = tierFor(mastery(stats[w.rule]));
              return (
                <motion.button
                  key={w.rule}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  onClick={() => setSession({ rule: w.rule, items: drillFor(w.rule, stats[w.rule]), index: 0, scores: [] })}
                  className={clsx("card flex flex-col items-start gap-4 p-5 text-left", i === 0 && "ring-2 ring-ember")}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="grid h-12 min-w-12 place-items-center rounded-2xl bg-gold/20 px-2 font-display text-xl font-extrabold">{s.symbol}</span>
                    <Ring value={w.mastery} size={52} stroke={6} color={scoreColor(w.mastery * 100)}>
                      <span className="text-xs font-bold">{Math.round(w.mastery * 100)}</span>
                    </Ring>
                  </div>
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-xs text-muted">
                      {i === 0 ? "Your weakest sound · " : ""}
                      {TIER_LABEL[tier]}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    Practice <ArrowRight size={14} />
                  </span>
                </motion.button>
              );
            })}
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted">
              <Target size={16} className="text-ember" /> Every sound you've practised
            </div>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {tracked.map((t) => {
                const s = soundById.get(t.rule)!;
                return (
                  <button key={t.rule} className="flex items-center gap-3 text-left" onClick={() => setSession({ rule: t.rule, items: drillFor(t.rule, stats[t.rule]), index: 0, scores: [] })}>
                    <span className="w-14 shrink-0 font-display font-bold">{s.symbol}</span>
                    <ProgressBar value={t.m ?? 0} className="h-2" color={t.m === null ? "var(--line)" : scoreColor((t.m ?? 0) * 100)} />
                    <span className="w-16 shrink-0 text-right text-xs text-muted">{t.m === null ? `${t.tries} tries` : `${Math.round(t.m * 100)}%`}</span>
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost mt-6 text-sm" onClick={() => setSession({ rule: null, items: diagnosticSet(8), index: 0, scores: [] })}>
              Re-check all sounds
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Drill({ session, setSession }: { session: Session; setSession: (s: Session | null) => void }) {
  const [scored, setScored] = useState(false);
  const item = session.items[session.index];
  const done = !item;
  const s = session.rule ? soundById.get(session.rule) : null;
  const avg = session.scores.length ? Math.round(session.scores.reduce((a, b) => a + b, 0) / session.scores.length) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <button aria-label="End practice" onClick={() => setSession(null)} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
          <X size={22} />
        </button>
        <ProgressBar value={session.index / session.items.length} />
        <span className="text-sm font-bold text-muted">
          {Math.min(session.index + 1, session.items.length)}/{session.items.length}
        </span>
      </div>

      {s && !done && <RuleTip rule={s.id} />}

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-8 text-center">
            <Check className="mx-auto text-good" size={40} />
            <h2 className="mt-3 font-display text-3xl font-extrabold">{session.rule ? "Drill done" : "Check done"}</h2>
            <p className="mt-2 text-muted">Average score {avg}. {session.rule ? "Your next drill adapts to how this went." : "Your weakest sounds are now waiting in practice."}</p>
            <button className="btn btn-gold mt-6" onClick={() => setSession(null)}>
              See my sounds
            </button>
          </motion.div>
        ) : (
          <motion.div key={session.index} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="card p-7">
            <div className="flex items-start gap-3">
              <PlayButton text={item.de} />
              <div>
                <p className={clsx("font-display font-extrabold tracking-tight", item.tier === 3 ? "text-2xl" : "text-3xl")}>{item.de}</p>
                <p className="mt-1 text-muted">{item.en}</p>
              </div>
            </div>
            <div className="mt-6">
              <SpeakPanel
                key={item.de}
                text={item.de}
                compact
                onResult={(r) => {
                  setScored(true);
                  setSession({ ...session, scores: [...session.scores, r.score] });
                }}
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                className="text-sm font-semibold text-muted hover:text-ink"
                onClick={() => {
                  setScored(false);
                  setSession({ ...session, index: session.index + 1 });
                }}
              >
                Skip
              </button>
              <button
                className="btn btn-gold"
                disabled={!scored}
                onClick={() => {
                  setScored(false);
                  setSession({ ...session, index: session.index + 1 });
                }}
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
