import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { Ear, Mic } from "lucide-react";
import { alphabet, sounds, soundById } from "@/data/content";
import type { Letter, Sound } from "@/data/types";
import { speak } from "@/lib/audio";
import { PageHeader, PlayButton } from "@/components/ui";
import { SpeakPanel } from "@/components/SpeakPanel";
import { Sheet } from "@/components/Sheet";

const CATEGORY_LABEL = { vowel: "Vowels", consonant: "Consonants", pattern: "Patterns & rules" } as const;
const SPECIAL = new Set(["Ä", "Ö", "Ü", "ß"]);

export default function Sounds() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "alphabet" || (!params.get("s") && params.get("tab") !== "sounds") ? "alphabet" : "sounds";
  const [letter, setLetter] = useState<Letter | null>(null);
  const openSound = params.get("s") ? soundById.get(params.get("s")!) ?? null : null;

  const setTab = (t: "alphabet" | "sounds") => setParams({ tab: t });
  const closeSound = () => setParams({ tab: "sounds" });

  return (
    <div>
      <PageHeader eyebrow="Pronunciation" title="Every sound of German">
        German is spelled almost exactly as it sounds. Learn these once and you can read any word aloud correctly, even ones you've never seen.
      </PageHeader>

      <div className="mb-8 inline-flex rounded-full bg-raised p-1">
        {(["alphabet", "sounds"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx("relative rounded-full px-5 py-2 text-sm font-semibold", tab === t ? "text-bg" : "text-muted")}>
            {tab === t && <motion.span layoutId="sound-tab" className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative">{t === "alphabet" ? "Das Alphabet" : "Sound guide"}</span>
          </button>
        ))}
      </div>

      {tab === "alphabet" ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8">
          {alphabet.map((l, i) => (
            <motion.button
              key={l.letter}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.015 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                setLetter(l);
                speak(l.name.includes("Umlaut") || l.letter === "ß" ? l.name : l.letter);
              }}
              className={clsx(
                "group relative flex aspect-square flex-col items-center justify-center rounded-3xl border-2 transition-colors",
                SPECIAL.has(l.letter) ? "border-gold bg-gold/15" : "border-line bg-surface hover:border-ink",
              )}
            >
              <span className="font-display text-4xl font-extrabold md:text-5xl">
                {l.letter}
                {l.letter !== "ß" && <span className="text-muted">{l.letter.toLowerCase()}</span>}
              </span>
              <span className="mt-1 font-mono text-xs text-muted">/{l.ipa}/</span>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {(["vowel", "consonant", "pattern"] as const).map((cat) => (
            <section key={cat}>
              <h2 className="mb-4 font-display text-2xl font-bold">{CATEGORY_LABEL[cat]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sounds
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <motion.button
                      key={s.id}
                      whileHover={{ y: -3 }}
                      onClick={() => setParams({ tab: "sounds", s: s.id })}
                      className="card flex items-center gap-4 p-4 text-left hover:border-ink"
                    >
                      <span className="grid h-14 min-w-14 place-items-center rounded-2xl bg-gold/20 px-2 font-display text-2xl font-extrabold">{s.symbol}</span>
                      <div className="min-w-0">
                        <p className="font-semibold">{s.title}</p>
                        <p className="truncate text-sm text-muted">{s.examples.map((e) => e.de.replace(/^(der|die|das) /, "")).join(", ")}</p>
                      </div>
                    </motion.button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!letter} onClose={() => setLetter(null)}>
        {letter && <LetterDetail letter={letter} />}
      </Sheet>
      <Sheet open={!!openSound} onClose={closeSound}>
        {openSound && <SoundDetail sound={openSound} />}
      </Sheet>
    </div>
  );
}

function LetterDetail({ letter }: { letter: Letter }) {
  const [practice, setPractice] = useState(false);
  const spoken = letter.name.includes("Umlaut") || letter.letter === "ß" ? letter.name : letter.letter;
  return (
    <div>
      <div className="flex items-center gap-5">
        <span className="grid h-24 w-24 place-items-center rounded-3xl bg-ink font-display text-6xl font-extrabold text-bg">{letter.letter}</span>
        <div>
          <p className="text-sm text-muted">Said as</p>
          <p className="font-display text-3xl font-bold">“{letter.name}”</p>
          <p className="font-mono text-muted">/{letter.ipa}/</p>
        </div>
        <PlayButton text={spoken} size="lg" className="ml-auto mr-8" />
      </div>
      <p className="mt-6 text-lg">{letter.sound}</p>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-raised p-4">
        <PlayButton text={letter.example.de} />
        <div>
          <p className="font-display text-xl font-bold">{letter.example.de}</p>
          <p className="text-sm text-muted">{letter.example.en}</p>
        </div>
      </div>
      <p className="mt-5 rounded-2xl bg-gold/15 p-4 text-sm">
        <span className="font-semibold">Tip: </span>
        {letter.tip}
      </p>
      <div className="mt-6">
        {practice ? (
          <SpeakPanel text={letter.example.de} compact />
        ) : (
          <button className="btn btn-primary w-full" onClick={() => setPractice(true)}>
            <Mic size={18} /> Say “{letter.example.de}”
          </button>
        )}
      </div>
    </div>
  );
}

function SoundDetail({ sound }: { sound: Sound }) {
  const [target, setTarget] = useState(sound.examples[0]?.de ?? "");
  return (
    <div>
      <div className="flex items-center gap-5 pr-10">
        <span className="grid h-20 min-w-20 place-items-center rounded-3xl bg-gold px-3 font-display text-4xl font-extrabold text-[#17141f]">{sound.symbol}</span>
        <div>
          <h2 className="font-display text-3xl font-bold">{sound.title}</h2>
          <p className="font-mono text-muted">/{sound.ipa}/</p>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <div className="rounded-2xl bg-raised p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-good">How to make it</p>
          <p className="mt-1">{sound.howTo}</p>
        </div>
        <div className="rounded-2xl bg-raised p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-bad">The English-speaker trap</p>
          <p className="mt-1">{sound.trap}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {sound.examples.map((e) => (
          <button
            key={e.de}
            onClick={() => setTarget(e.de)}
            className={clsx("flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors", target === e.de ? "border-ink" : "border-line")}
          >
            <PlayButton text={e.de} size="sm" />
            <div>
              <p className="font-semibold">{e.de}</p>
              <p className="text-xs text-muted">{e.en}</p>
            </div>
          </button>
        ))}
      </div>
      {sound.pairs.length > 0 && <EarTraining pairs={sound.pairs} />}
      <div className="mt-8">
        <p className="mb-4 text-center font-display text-xl font-bold">Now you: “{target}”</p>
        <SpeakPanel text={target} compact />
      </div>
    </div>
  );
}

function EarTraining({ pairs }: { pairs: [string, string][] }) {
  const [round, setRound] = useState<{ pair: [string, string]; answer: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  function next() {
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const answer = pair[Math.random() < 0.5 ? 0 : 1];
    setRound({ pair, answer });
    setPicked(null);
    speak(answer);
  }

  return (
    <div className="mt-8 rounded-3xl border-2 border-dashed border-line p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Ear size={18} className="text-der" /> Ear training
        </p>
        {score.total > 0 && (
          <span className="chip">
            {score.right}/{score.total}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">Minimal pairs differ by one sound. Hear the difference before you try to say it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {pairs.map(([a, b]) => (
          <span key={a + b} className="flex items-center gap-1 rounded-full bg-raised p-1 pr-3 text-sm">
            <PlayButton text={a} size="sm" /> {a} <span className="mx-1 text-muted">vs</span> <PlayButton text={b} size="sm" /> {b}
          </span>
        ))}
      </div>
      {round ? (
        <div className="mt-5">
          <div className="flex items-center gap-3">
            <PlayButton text={round.answer} label="Replay the mystery word" />
            <p className="font-semibold">Which one did you hear?</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {round.pair.map((w) => (
              <button
                key={w}
                disabled={!!picked}
                onClick={() => {
                  setPicked(w);
                  setScore((s) => ({ right: s.right + (w === round.answer ? 1 : 0), total: s.total + 1 }));
                }}
                className={clsx(
                  "rounded-2xl border-2 p-3 font-semibold transition-colors",
                  !picked && "border-line hover:border-ink",
                  picked && w === round.answer && "border-good bg-good/15",
                  picked === w && w !== round.answer && "border-bad bg-bad/15",
                  picked && w !== round.answer && picked !== w && "border-line opacity-50",
                )}
              >
                {w}
              </button>
            ))}
          </div>
          {picked && (
            <button className="btn btn-ghost mt-3 w-full" onClick={next}>
              Next one
            </button>
          )}
        </div>
      ) : (
        <button className="btn btn-primary mt-5 w-full" onClick={next}>
          <Ear size={18} /> Test my ear
        </button>
      )}
    </div>
  );
}
