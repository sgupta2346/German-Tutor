import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { Check, Lock, Play, Star, Hourglass } from "lucide-react";
import { levels, lessonsForUnit, lessonOrder, soundById } from "@/data/content";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui";

export default function Learn() {
  const results = useStore((s) => s.lessons);
  const nextId = lessonOrder.find((id) => !results[id]);
  const [levelId, setLevelId] = useState("A1");
  const level = levels.find((l) => l.id === levelId)!;
  let unitIndex = 0;

  return (
    <div>
      <PageHeader eyebrow="Lernpfad" title="Your path to fluent German">
        Five levels, from your first Hallo to arguing about politics in a Berlin bar. Each unit pairs grammar with the vocabulary and the sounds you need for it.
      </PageHeader>

      <div className="scrollbar-none -mx-4 mb-10 flex gap-2 overflow-x-auto px-4">
        {levels.map((l) => (
          <button
            key={l.id}
            onClick={() => setLevelId(l.id)}
            className={clsx(
              "relative shrink-0 rounded-2xl px-5 py-3 text-left transition-colors",
              l.id === levelId ? "text-bg" : "bg-surface text-ink hover:bg-raised",
            )}
          >
            {l.id === levelId && <motion.span layoutId="level-pill" className="absolute inset-0 rounded-2xl bg-ink" />}
            <span className="relative block font-display text-xl font-extrabold">{l.id}</span>
            <span className={clsx("relative block text-xs", l.id === levelId ? "text-bg/70" : "text-muted")}>{l.title}</span>
          </button>
        ))}
      </div>

      <p className="mb-8 max-w-xl text-lg text-muted">{level.summary}</p>

      <div className="relative space-y-14">
        {level.units.map((unit) => {
          const unitLessons = lessonsForUnit(unit.id);
          const ready = unitLessons.length > 0;
          const completed = unitLessons.filter((l) => results[l.id]).length;
          const side = unitIndex++ % 2;
          return (
            <motion.section
              key={unit.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45 }}
              className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-center"
            >
              <div className={clsx(side && "md:order-2")}>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-ember">
                  Unit {unit.id.split("-u")[1]} · {unit.titleDe}
                </p>
                <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{unit.title}</h2>
                <p className="mt-2 text-muted">{unit.goal}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {unit.grammar.map((g) => (
                    <span key={g} className="chip">
                      {g}
                    </span>
                  ))}
                  {unit.sounds.map((s) => (
                    <Link key={s} to={`/sounds?s=${s}`} className="chip !bg-gold/20 !text-ink hover:!bg-gold/40">
                      {soundById.get(s)?.symbol} sound
                    </Link>
                  ))}
                </div>
              </div>

              <div className={clsx("card relative overflow-hidden p-6", side && "md:order-1")}>
                {ready ? (
                  <>
                    <div className="mb-5 flex items-center justify-between text-sm">
                      <span className="font-semibold text-muted">
                        {completed}/{unitLessons.length} lessons
                      </span>
                      {completed === unitLessons.length && <span className="chip !bg-good/15 !text-good">Complete</span>}
                    </div>
                    <div className="flex flex-col gap-3">
                      {unitLessons.map((lesson, i) => {
                        const res = results[lesson.id];
                        const isNext = lesson.id === nextId;
                        const locked = !res && !isNext && i > 0 && !results[unitLessons[i - 1].id];
                        return (
                          <Link
                            key={lesson.id}
                            to={locked ? "#" : `/lesson/${lesson.id}`}
                            onClick={(e) => locked && e.preventDefault()}
                            className={clsx(
                              "group flex items-center gap-4 rounded-2xl p-3 transition-colors",
                              isNext ? "bg-gold/20" : "hover:bg-raised",
                              locked && "cursor-not-allowed opacity-50",
                            )}
                            style={{ marginLeft: `${[0, 28, 8][i % 3]}px` }}
                          >
                            <motion.span
                              whileHover={!locked ? { scale: 1.08, rotate: -4 } : undefined}
                              className={clsx(
                                "relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl",
                                res ? "bg-good text-white" : isNext ? "bg-ink text-bg" : "bg-raised text-muted",
                              )}
                              style={{ boxShadow: res ? "0 5px 0 #15803d" : isNext ? "0 5px 0 #000" : "0 5px 0 var(--line)" }}
                            >
                              {isNext && <span className="absolute inset-0 rounded-2xl bg-ink animate-pulse-ring" />}
                              {res ? <Check size={24} strokeWidth={3} /> : locked ? <Lock size={20} /> : <Play size={22} fill="currentColor" className="relative" />}
                            </motion.span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{lesson.title}</p>
                              <p className="text-xs text-muted">{lesson.steps.length} steps</p>
                            </div>
                            {res && (
                              <span className="flex gap-0.5">
                                {[1, 2, 3].map((s) => (
                                  <Star key={s} size={14} className={s <= res.stars ? "text-gold" : "text-line"} fill="currentColor" />
                                ))}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-4 py-6">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-raised text-muted">
                      <Hourglass size={22} />
                    </span>
                    <div>
                      <p className="font-semibold">Lessons in preparation</p>
                      <p className="text-sm text-muted">This unit's lessons are being written and checked. The topics on the left are what it will cover.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
