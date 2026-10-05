import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Flame, Layers, Mic, Sparkles, Target, Trophy } from "lucide-react";
import { lessonById, lessonOrder, sounds, unitById, cards } from "@/data/content";
import { currentStreak, today, useStore } from "@/lib/store";
import { buildQueue, isMastered } from "@/lib/srs";
import { PlayButton, ProgressBar, Ring } from "@/components/ui";
import { RuleTip } from "@/components/SpeakPanel";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return { en: "Good morning", de: "Guten Morgen" };
  if (h < 18) return { en: "Good afternoon", de: "Guten Tag" };
  return { en: "Good evening", de: "Guten Abend" };
}

function soundOfTheDay() {
  const d = new Date();
  const idx = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % sounds.length;
  return sounds[idx];
}

const fade = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * i, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const },
});

export default function Home() {
  const { name, xpByDay, settings, lessons, srs, attempts, newIntroduced } = useStore();
  const streak = useStore((s) => currentStreak(s.streak, s.lastActive));
  const xpToday = xpByDay[today()] ?? 0;
  const goal = settings.dailyGoal;

  const nextLessonId = lessonOrder.find((id) => !lessons[id]) ?? lessonOrder[lessonOrder.length - 1];
  const nextLesson = lessonById.get(nextLessonId)!;
  const nextUnit = unitById.get(nextLesson.unit)!;
  const done = lessonOrder.filter((id) => lessons[id]).length;

  const newLeft = Math.max(0, settings.newPerDay - (newIntroduced[today()] ?? 0));
  const customCount = useStore((s) => s.customWords.length);
  const knownMap = useStore((s) => s.known);
  const queue = useMemo(() => buildQueue(srs, { newLimit: newLeft }), [srs, newLeft, customCount, knownMap]);
  const mastered = cards.filter((c) => isMastered(srs[c.id])).length;
  const learned = Object.keys(srs).length;

  const weakRules = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of attempts.slice(0, 40)) for (const r of a.focus) counts.set(r, (counts.get(r) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  }, [attempts]);

  const avgScore = attempts.length ? Math.round(attempts.slice(0, 20).reduce((s, a) => s + a.score, 0) / Math.min(20, attempts.length)) : null;
  const sotd = soundOfTheDay();

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = today(d);
    return { key, xp: xpByDay[key] ?? 0, label: d.toLocaleDateString("en-GB", { weekday: "narrow" }) };
  });
  const maxWeek = Math.max(goal, ...week.map((w) => w.xp));

  return (
    <div className="space-y-6">
      <motion.section {...fade(0)} className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ember">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight md:text-6xl">
            {greeting().en}
            {name ? `, ${name}` : ""}!
          </h1>
          <p className="mt-3 flex items-center gap-2 text-muted">
            <PlayButton text={`${greeting().de}!`} size="sm" />
            In German: <span className="font-semibold text-ink">{greeting().de}!</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Ring value={xpToday / goal} size={92} stroke={9}>
            <div className="text-center leading-none">
              <p className="font-display text-xl font-extrabold">{xpToday}</p>
              <p className="text-[10px] font-semibold text-muted">/ {goal} XP</p>
            </div>
          </Ring>
          <div className="card flex items-center gap-3 px-4 py-3">
            <motion.div animate={streak ? { scale: [1, 1.15, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }}>
              <Flame size={30} className={streak ? "text-ember" : "text-muted"} fill={streak ? "currentColor" : "none"} />
            </motion.div>
            <div>
              <p className="font-display text-2xl font-extrabold leading-none">{streak}</p>
              <p className="text-xs text-muted">day streak</p>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div {...fade(1)} className="lg:col-span-2">
          <Link to={`/lesson/${nextLesson.id}`} className="hero group relative block overflow-hidden rounded-[2rem] p-7 md:p-9">
            <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-gold/30 blur-3xl transition-transform duration-700 group-hover:scale-125" />
            <div className="absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-ember/30 blur-3xl" />
            <div className="relative">
              <p className="chip !bg-white/10 !text-white/80">
                {nextUnit.level} · {nextUnit.titleDe}
              </p>
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">{nextLesson.title}</h2>
              <p className="mt-2 max-w-md text-white/70">{nextUnit.goal}</p>
              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="w-full max-w-xs">
                  <ProgressBar value={done / lessonOrder.length} className="!bg-white/10" />
                  <p className="mt-2 text-xs text-white/60">
                    {done} of {lessonOrder.length} lessons ready so far
                  </p>
                </div>
                <span className="btn btn-gold shrink-0">
                  {done ? "Continue" : "Start"} <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        </motion.div>

        <motion.div {...fade(2)}>
          <Link to="/cards/review" className="card group flex h-full flex-col justify-between gap-6 p-7 transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-der/15 text-der">
                <Layers size={24} />
              </div>
              <span className="chip">{learned} seen</span>
            </div>
            <div>
              <p className="font-display text-5xl font-extrabold">{queue.length}</p>
              <p className="text-muted">cards waiting for you</p>
            </div>
            <span className="flex items-center gap-2 font-semibold">
              Review now <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div {...fade(3)} className="card p-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Sparkles size={16} className="text-gold" /> Sound of the day
          </div>
          <div className="mt-5 flex items-center gap-4">
            <span className="grid h-20 w-20 place-items-center rounded-3xl bg-gold font-display text-4xl font-extrabold text-[#17141f]">{sotd.symbol}</span>
            <div>
              <p className="font-display text-xl font-bold">{sotd.title}</p>
              <p className="font-mono text-sm text-muted">/{sotd.ipa}/</p>
            </div>
          </div>
          <p className="mt-4 text-sm">{sotd.howTo}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sotd.examples.slice(0, 3).map((e) => (
              <span key={e.de} className="flex items-center gap-2 rounded-full bg-raised py-1 pl-1 pr-3 text-sm">
                <PlayButton text={e.de} size="sm" />
                {e.de}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div {...fade(4)} className="card p-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Target size={16} className="text-ember" /> Your accent
          </div>
          {weakRules.length ? (
            <div className="mt-4 space-y-3">
              {weakRules.map(([r]) => (
                <RuleTip key={r} rule={r} />
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <p className="font-display text-xl font-bold">Nothing to fix yet</p>
              <p className="mt-2 text-sm text-muted">Record yourself in the Speak studio. The sounds you struggle with most will show up here with tips.</p>
              <Link to="/speak" className="btn btn-primary mt-5 text-sm">
                <Mic size={16} /> Open Speak studio
              </Link>
            </div>
          )}
        </motion.div>

        <motion.div {...fade(5)} className="card p-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Trophy size={16} className="text-das" /> This week
          </div>
          <div className="mt-6 flex h-28 items-end justify-between gap-2">
            {week.map((d, i) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                <motion.div
                  className="w-full rounded-lg"
                  style={{ background: d.xp >= goal ? "var(--color-gold)" : d.xp ? "color-mix(in oklab, var(--color-gold) 45%, transparent)" : "var(--raised)" }}
                  initial={{ height: 4 }}
                  animate={{ height: Math.max(4, (d.xp / maxWeek) * 96) }}
                  transition={{ delay: 0.3 + i * 0.05, type: "spring", stiffness: 120, damping: 16 }}
                />
                <span className="text-xs font-semibold text-muted">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-raised p-3">
              <p className="font-display text-2xl font-extrabold">{mastered}</p>
              <p className="text-xs text-muted">words mastered</p>
            </div>
            <div className="rounded-2xl bg-raised p-3">
              <p className="font-display text-2xl font-extrabold">{avgScore ?? "–"}</p>
              <p className="text-xs text-muted">avg. speaking score</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
