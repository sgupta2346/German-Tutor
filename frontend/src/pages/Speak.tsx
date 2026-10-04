import { useMemo, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Shuffle } from "lucide-react";
import { cards, lessons, paragraphs, sounds, withArticle } from "@/data/content";
import { useStore } from "@/lib/store";
import { PageHeader, PlayButton, scoreColor } from "@/components/ui";
import { SpeakPanel } from "@/components/SpeakPanel";

type Mode = "words" | "sentences" | "paragraphs";

interface Item {
  de: string;
  en: string;
  tag: string;
}

function buildItems(mode: Mode): Item[] {
  if (mode === "words") {
    const pairs = sounds.flatMap((s) => s.pairs.flat().map((de) => ({ de, en: "minimal pair", tag: s.symbol })));
    const words = cards.filter((c) => !c.de.includes(" ")).map((c) => ({ de: withArticle(c), en: c.en, tag: c.deckId.replace("a1-", "") }));
    const seen = new Set<string>();
    return [...pairs, ...words].filter((i) => (seen.has(i.de) ? false : (seen.add(i.de), true)));
  }
  if (mode === "sentences") {
    const fromLessons = lessons.flatMap((l) => l.steps.flatMap((s) => (s.type === "speak" || s.type === "phrase" || s.type === "listen" ? [{ de: s.de, en: s.en, tag: l.title }] : [])));
    const fromCards = cards.map((c) => ({ de: c.ex.de, en: c.ex.en, tag: c.deckId.replace("a1-", "") }));
    const seen = new Set<string>();
    return [...fromLessons, ...fromCards].filter((i) => i.de.split(" ").length >= 3 && (seen.has(i.de) ? false : (seen.add(i.de), true)));
  }
  return paragraphs.map((p) => ({ de: p.de, en: p.en, tag: `${p.level} · ${p.title}` }));
}

export default function Speak() {
  const [mode, setMode] = useState<Mode>("words");
  const items = useMemo(() => buildItems(mode), [mode]);
  const [index, setIndex] = useState(0);
  const attempts = useStore((s) => s.attempts);
  const item = items[Math.min(index, items.length - 1)];
  const best = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attempts) m.set(a.text, Math.max(m.get(a.text) ?? 0, a.score));
    return m;
  }, [attempts]);

  return (
    <div>
      <PageHeader eyebrow="Sprechstudio" title="Speak, get scored, improve">
        Record yourself and every sound is compared against standard German pronunciation. You see exactly which sounds slipped into an English accent, and how to fix them.
      </PageHeader>

      <div className="mb-6 inline-flex rounded-full bg-raised p-1">
        {(["words", "sentences", "paragraphs"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setIndex(0);
            }}
            className={clsx("relative rounded-full px-5 py-2 text-sm font-semibold capitalize", mode === m ? "text-bg" : "text-muted")}
          >
            {mode === m && <motion.span layoutId="speak-tab" className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative">{m}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="card order-2 max-h-[70vh] overflow-y-auto p-2 lg:order-1">
          {items.map((it, i) => {
            const score = best.get(it.de);
            return (
              <button
                key={it.de}
                onClick={() => setIndex(i)}
                className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors", i === index ? "bg-gold/25" : "hover:bg-raised")}
              >
                <div className="min-w-0 flex-1">
                  <p className={clsx("truncate font-semibold", mode === "paragraphs" && "text-sm")}>{mode === "paragraphs" ? it.tag : it.de}</p>
                  <p className="truncate text-xs text-muted">{mode === "paragraphs" ? it.de : it.en}</p>
                </div>
                {score !== undefined && (
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: scoreColor(score) }}>
                    {score}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <section className="order-1 space-y-6 lg:order-2">
          <motion.div key={item.de} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card relative overflow-hidden p-7 md:p-9">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <span className="chip">{item.tag}</span>
              <button className="btn btn-ghost text-sm" onClick={() => setIndex(Math.floor(Math.random() * items.length))}>
                <Shuffle size={15} /> Random
              </button>
            </div>
            <p className={clsx("relative mt-6 font-display font-extrabold tracking-tight text-balance", mode === "paragraphs" ? "text-2xl leading-snug md:text-3xl" : "text-4xl md:text-5xl")}>{item.de}</p>
            <p className="relative mt-3 text-muted">{item.en}</p>
            <div className="relative mt-6 flex gap-2">
              <PlayButton text={item.de} />
              <PlayButton text={item.de} slow />
            </div>
          </motion.div>

          <div className="card p-7">
            <SpeakPanel text={item.de} />
          </div>
        </section>
      </div>
    </div>
  );
}
