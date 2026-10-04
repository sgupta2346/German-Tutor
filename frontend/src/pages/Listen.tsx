import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { Check, Eye, EyeOff, Headphones, Pause, Play, RotateCcw, Shuffle } from "lucide-react";
import { lessons, levels, paragraphs } from "@/data/content";
import { speak, stop, useNaturalVoices, useSpeaking } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { editDistance, normalizeAnswer } from "@/pages/LessonPlayer";
import { PageHeader } from "@/components/ui";

interface Clip {
  de: string;
  en: string;
  level: string;
  label: string;
}

const SPEEDS = [0.75, 1, 1.2];

function buildClips(): Clip[] {
  const unitLevel = new Map(levels.flatMap((l) => l.units.map((u) => [u.id, l.id] as const)));
  const sentences = lessons.flatMap((l) =>
    l.steps.flatMap((s) => (s.type === "listen" || s.type === "phrase" || s.type === "speak") && s.de.split(" ").length >= 3 ? [{ de: s.de, en: s.en, level: unitLevel.get(l.unit) ?? "A1", label: l.title }] : []),
  );
  const texts = paragraphs.map((p) => ({ de: p.de, en: p.en, level: p.level, label: p.title }));
  const seen = new Set<string>();
  return [...texts, ...sentences].filter((c) => (seen.has(c.de) ? false : (seen.add(c.de), true)));
}

type Mark = { word: string; state: "ok" | "close" | "miss" };

function compare(target: string, typed: string): { marks: Mark[]; extra: number } {
  const want = target.split(/\s+/).filter(Boolean);
  const got = typed.split(/\s+/).map(normalizeAnswer).filter(Boolean);
  const used = new Set<number>();
  const marks = want.map((word) => {
    const n = normalizeAnswer(word);
    const exact = got.findIndex((g, i) => !used.has(i) && g === n);
    if (exact >= 0) {
      used.add(exact);
      return { word, state: "ok" as const };
    }
    const near = got.findIndex((g, i) => !used.has(i) && editDistance(g, n) <= Math.max(1, Math.floor(n.length / 5)));
    if (near >= 0) {
      used.add(near);
      return { word, state: "close" as const };
    }
    return { word, state: "miss" as const };
  });
  return { marks, extra: got.length - used.size };
}

export default function Listen() {
  const clips = useMemo(buildClips, []);
  const natural = useNaturalVoices();
  const defaultVoice = useStore((s) => s.settings.voice);
  const addXp = useStore((s) => s.addXp);
  const [level, setLevel] = useState("A1");
  const pool = clips.filter((c) => c.level === level);
  const [index, setIndex] = useState(0);
  const clip = pool[Math.min(index, Math.max(0, pool.length - 1))];
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState<string>(natural.includes(defaultVoice) ? defaultVoice : natural[0] ?? "browser");
  const [mode, setMode] = useState<"dictation" | "listen">("dictation");
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [showText, setShowText] = useState(false);
  const speaking = useSpeaking(clip?.de);
  const touchedVoice = useRef(false);

  useEffect(() => {
    if (!touchedVoice.current && natural.length) setVoice(natural.includes(defaultVoice) ? defaultVoice : natural[0]);
  }, [natural, defaultVoice]);

  const result = useMemo(() => (checked && clip ? compare(clip.de, typed) : null), [checked, clip, typed]);
  const accuracy = result ? result.marks.filter((m) => m.state !== "miss").length / result.marks.length : 0;

  function pick(i: number) {
    stop();
    setIndex(i);
    setTyped("");
    setChecked(false);
    setShowText(false);
  }

  function play() {
    if (!clip) return;
    if (speaking) return stop();
    speak(clip.de, { rate: speed, voice });
  }

  return (
    <div>
      <PageHeader eyebrow="Hörverstehen" title="Train your ear">
        Real conversations are fast. Listen to the same text at different speeds and with different voices until every word is clear, then write down exactly what you heard.
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-raised p-1">
          {levels.map((l) => (
            <button
              key={l.id}
              disabled={!clips.some((c) => c.level === l.id)}
              onClick={() => {
                setLevel(l.id);
                pick(0);
              }}
              className={clsx("relative rounded-full px-4 py-2 text-sm font-bold disabled:opacity-30", level === l.id ? "text-bg" : "text-muted")}
            >
              {level === l.id && <motion.span layoutId="listen-level" className="absolute inset-0 rounded-full bg-ink" />}
              <span className="relative">{l.id}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full bg-raised p-1">
          {(["dictation", "listen"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={clsx("rounded-full px-4 py-2 text-sm font-semibold", mode === m ? "bg-surface text-ink shadow" : "text-muted")}>
              {m === "dictation" ? "Dictation" : "Just listen"}
            </button>
          ))}
        </div>
      </div>

      {clip ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="min-w-0 space-y-5">
            <div className="hero relative overflow-hidden rounded-[2rem] p-7 md:p-9">
              <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-der/30 blur-3xl" />
              <div className="relative flex items-center justify-between">
                <span className="chip !bg-white/10 !text-white/80">
                  {clip.level} · {clip.label}
                </span>
                <button className="btn !bg-white/10 px-3 py-1.5 text-sm text-white" onClick={() => pick(Math.floor(Math.random() * pool.length))}>
                  <Shuffle size={14} /> Random
                </button>
              </div>
              <div className="relative mt-8 flex items-center gap-4 md:gap-6">
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={play}
                  aria-label={speaking ? "Pause" : "Play"}
                  className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gold text-[#17141f] shadow-xl"
                >
                  {speaking ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                </motion.button>
                <div className="flex h-14 min-w-0 flex-1 items-center gap-1 overflow-hidden" aria-hidden>
                  {Array.from({ length: 36 }, (_, i) => (
                    <motion.span
                      key={i}
                      className="min-w-[3px] flex-1 rounded-full bg-white/40"
                      animate={speaking ? { height: [8, 12 + ((i * 37) % 40), 8] } : { height: 8 }}
                      transition={speaking ? { duration: 0.6 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                    />
                  ))}
                </div>
              </div>
              <div className="relative mt-8 flex flex-wrap gap-2">
                {SPEEDS.map((s) => (
                  <button key={s} onClick={() => setSpeed(s)} className={clsx("rounded-full px-3 py-1 text-sm font-bold", speed === s ? "bg-white text-[#17141f]" : "bg-white/10 text-white/80")}>
                    {s}×
                  </button>
                ))}
                <span className="mx-1 w-px bg-white/20" />
                {[...natural, "browser"].map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      touchedVoice.current = true;
                      setVoice(v);
                    }} className={clsx("rounded-full px-3 py-1 text-sm font-bold capitalize", voice === v ? "bg-white text-[#17141f]" : "bg-white/10 text-white/80")}>
                    {v === "browser" ? "Browser voice" : v}
                  </button>
                ))}
              </div>
            </div>

            {mode === "dictation" ? (
              <div className="card p-6">
                <textarea
                  value={typed}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    setChecked(false);
                  }}
                  rows={clip.de.length > 120 ? 5 : 3}
                  lang="de"
                  spellCheck={false}
                  placeholder="Write what you hear…"
                  className="w-full resize-none rounded-2xl border-2 border-line bg-bg p-4 text-lg outline-none focus:border-der"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {["ä", "ö", "ü", "ß"].map((ch) => (
                    <button key={ch} onClick={() => setTyped((t) => t + ch)} className="btn btn-ghost h-10 w-10 !p-0 text-lg">
                      {ch}
                    </button>
                  ))}
                  <button
                    className="btn btn-gold ml-auto"
                    disabled={!typed.trim()}
                    onClick={() => {
                      setChecked(true);
                      const r = compare(clip.de, typed);
                      const acc = r.marks.filter((m) => m.state !== "miss").length / r.marks.length;
                      addXp(acc >= 0.9 ? 4 : acc >= 0.6 ? 2 : 1);
                    }}
                  >
                    <Check size={18} /> Check
                  </button>
                </div>
                <AnimatePresence>
                  {result && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
                      <p className="font-display text-xl font-bold">
                        {Math.round(accuracy * 100)}% of words caught
                        {result.extra > 0 && <span className="ml-2 text-sm font-normal text-muted">({result.extra} extra)</span>}
                      </p>
                      <p className="text-lg leading-relaxed">
                        {result.marks.map((m, i) => (
                          <span
                            key={i}
                            className={clsx(
                              "mr-1.5 inline-block rounded-md px-1",
                              m.state === "ok" && "bg-good/15 text-good",
                              m.state === "close" && "bg-gold/25",
                              m.state === "miss" && "bg-bad/15 text-bad underline decoration-dotted",
                            )}
                          >
                            {m.word}
                          </span>
                        ))}
                      </p>
                      <p className="text-sm text-muted">{clip.en}</p>
                      <button className="btn btn-ghost text-sm" onClick={() => pick(index + 1 < pool.length ? index + 1 : 0)}>
                        Next <RotateCcw size={14} className="rotate-180" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="card p-6">
                <button className="btn btn-ghost text-sm" onClick={() => setShowText((s) => !s)}>
                  {showText ? <EyeOff size={15} /> : <Eye size={15} />} {showText ? "Hide text" : "Show text"}
                </button>
                <AnimatePresence>
                  {showText && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <p className="mt-5 font-display text-2xl font-bold leading-snug">{clip.de}</p>
                      <p className="mt-2 text-muted">{clip.en}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </section>

          <aside className="card max-h-[70vh] overflow-y-auto p-2">
            {pool.map((c, i) => (
              <button key={c.de} onClick={() => pick(i)} className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", i === index ? "bg-gold/25" : "hover:bg-raised")}>
                <Headphones size={16} className="shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.label}</p>
                  <p className="truncate text-xs text-muted">{c.de.split(" ").length} words</p>
                </div>
              </button>
            ))}
          </aside>
        </div>
      ) : (
        <p className="text-muted">No listening material for this level yet.</p>
      )}
    </div>
  );
}
