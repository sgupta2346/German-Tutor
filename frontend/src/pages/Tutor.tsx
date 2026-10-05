import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AlertCircle, ArrowUp, Check, ExternalLink, KeyRound, Languages, Loader2, Mic, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { lessons, soundById, unitById } from "@/data/content";
import { speak } from "@/lib/audio";
import { Recorder } from "@/lib/recorder";
import { BrowserTranscriber, browserRecognitionAvailable, scoreLocally } from "@/lib/scorer";
import { referencePhones, tokenize } from "@/lib/phonetics";
import { rulesInText, weakestSounds } from "@/lib/practice";
import { useStore } from "@/lib/store";
import { listFlashModels, SCENARIOS, systemPrompt, TutorError, tutorTurn, useTutor, type ChatMessage, type TutorReply } from "@/lib/tutor";
import { PageHeader, PlayButton, scoreColor } from "@/components/ui";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function useLearnerLevel(): string {
  const done = useStore((s) => s.lessons);
  return useMemo(() => {
    let best = 0;
    for (const id of Object.keys(done)) {
      const l = lessons.find((x) => x.id === id);
      const lvl = l ? unitById.get(l.unit)?.level : undefined;
      if (lvl) best = Math.max(best, LEVELS.indexOf(lvl));
    }
    return LEVELS[best];
  }, [done]);
}

export default function Tutor() {
  const { apiKey } = useTutor();
  return (
    <div>
      <PageHeader eyebrow="Conversation" title="Talk with Lena">
        A live tutor who chats with you in German at your level, plays out real situations, and corrects your mistakes as you go. Type or speak, and your pronunciation is scored too.
      </PageHeader>
      {apiKey ? <Chat /> : <KeySetup />}
    </div>
  );
}

function KeySetup() {
  const setKey = useTutor((s) => s.setKey);
  const [key, setLocal] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setState("checking");
    try {
      const models = await listFlashModels(key.trim());
      if (!models.length) throw new TutorError("This key has no Gemini Flash model available.", "other");
      setKey(key.trim(), models[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check the key.");
      setState("error");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="hero hero-night relative overflow-hidden rounded-[2rem] p-8">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-gold/25 blur-3xl" />
        <div className="relative">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
            <KeyRound />
          </span>
          <h2 className="mt-5 font-display text-3xl font-extrabold">Connect a free Gemini key</h2>
          <p className="mt-2 max-w-md text-white/70">The tutor runs on Google's Gemini, which is free for this amount of use. You only need a Google account, no card.</p>
          <ol className="mt-6 space-y-3 text-white/90">
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold font-bold text-[#17141f]">1</span>
              <span>
                Open{" "}
                <a className="inline-flex items-center gap-1 font-semibold underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Google AI Studio <ExternalLink size={13} />
                </a>{" "}
                and click Create API key.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold font-bold text-[#17141f]">2</span>
              <span>Paste it here. It stays in this browser only and is never part of your progress export.</span>
            </li>
          </ol>
        </div>
      </div>
      <div className="card flex flex-col justify-center p-7">
        <label className="text-sm font-semibold" htmlFor="gemini-key">
          Gemini API key
        </label>
        <input
          id="gemini-key"
          type="password"
          value={key}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && key.trim() && save()}
          placeholder="AIza…"
          autoComplete="off"
          className="mt-2 rounded-xl border-2 border-line bg-bg px-4 py-3 font-mono outline-none focus:border-ink"
        />
        {state === "error" && (
          <p className="mt-3 flex items-center gap-2 text-sm text-bad">
            <AlertCircle size={15} /> {error}
          </p>
        )}
        <button className="btn btn-gold mt-5" disabled={!key.trim() || state === "checking"} onClick={save}>
          {state === "checking" ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} Connect
        </button>
        <p className="mt-4 text-xs text-muted">What you write to the tutor is sent to Google's Gemini API. Google's free tier may use it to improve their products.</p>
      </div>
    </div>
  );
}

function Chat() {
  const { apiKey, model, level: levelPref, chats, append, patch, clear, setLevel, setModel, forget } = useTutor();
  const name = useStore((s) => s.name);
  const stats = useStore((s) => s.soundStats);
  const addCustomWord = useStore((s) => s.addCustomWord);
  const addXp = useStore((s) => s.addXp);
  const recordSounds = useStore((s) => s.recordSounds);
  const autoLevel = useLearnerLevel();
  const level = levelPref === "auto" ? autoLevel : levelPref;
  const [scenarioId, setScenarioId] = useState("smalltalk");
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const messages = chats[scenarioId] ?? [];
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TutorError | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [showEn, setShowEn] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [recording, setRecording] = useState(false);
  const [pendingPron, setPendingPron] = useState<{ score: number; focus: string[] } | null>(null);
  const rec = useRef<Recorder | null>(null);
  const asr = useRef<BrowserTranscriber | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const weak = useMemo(() => weakestSounds(stats, 3).map((w) => soundById.get(w.rule)?.symbol ?? w.rule), [stats]);
  const autoplay = useStore((s) => s.settings.autoplay);

  useEffect(() => {
    listFlashModels(apiKey).then(setModels).catch(() => {});
  }, [apiKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  async function run(userText: string | null) {
    setBusy(true);
    setError(null);
    const history = useTutor.getState().chats[scenarioId] ?? [];
    let userId: string | null = null;
    if (userText !== null) {
      userId = uid();
      append(scenarioId, { id: userId, role: "user", text: userText, at: Date.now(), pronunciation: pendingPron ?? undefined });
      setPendingPron(null);
    }
    try {
      const reply: TutorReply = await tutorTurn(apiKey, model, systemPrompt({ level, scenario, name, weakSounds: weak }), history, userText);
      if (userId) patch(scenarioId, userId, { corrections: reply.corrections });
      append(scenarioId, { id: uid(), role: "tutor", text: reply.reply, reply, at: Date.now() });
      if (userText !== null) addXp(reply.corrections.length ? 2 : 3);
      if (autoplay) speak(reply.reply);
    } catch (e) {
      setError(e instanceof TutorError ? e : new TutorError("Something went wrong.", "other"));
    } finally {
      setBusy(false);
    }
  }

  const started = useRef(new Set<string>());
  useEffect(() => {
    if (messages.length === 0 && !busy && !started.current.has(scenarioId)) {
      started.current.add(scenarioId);
      run(null);
    }
  }, [scenarioId, messages.length]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    run(text);
  }

  async function toggleMic() {
    if (recording) {
      setRecording(false);
      const r = rec.current;
      rec.current = null;
      const [audio, heard] = await Promise.all([r!.stop(), asr.current?.stop() ?? Promise.resolve(null)]);
      const text = heard?.trim() ?? "";
      if (!text) {
        setError(new TutorError("Couldn't make out what you said. Try again or type it.", "other"));
        return;
      }
      setInput((v) => (v ? `${v} ${text}` : text));
      const words = tokenize(text);
      const known = words.filter((w) => referencePhones(w) !== null);
      if (known.length >= Math.max(2, words.length / 2)) {
        try {
          const scored = await scoreLocally(audio.pcm, text, null);
          const focus = scored.focus.map((f) => f.rule);
          setPendingPron({ score: scored.score, focus });
          recordSounds(rulesInText(text), focus);
        } catch {
          setPendingPron(null);
        }
      }
      return;
    }
    const r = new Recorder();
    try {
      await r.start();
    } catch {
      setError(new TutorError("Microphone access was blocked.", "other"));
      return;
    }
    rec.current = r;
    asr.current = new BrowserTranscriber();
    asr.current.start();
    setRecording(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <div className="card p-3">
          <p className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted">Situation</p>
          <div className="scrollbar-none flex gap-1 overflow-x-auto lg:flex-col">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                className={clsx("shrink-0 rounded-xl px-3 py-2.5 text-left transition-colors", s.id === scenarioId ? "bg-gold/25" : "hover:bg-raised")}
              >
                <p className="text-sm font-semibold">{s.titleDe}</p>
                <p className="text-xs text-muted">{s.title}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="card space-y-3 p-4 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span className="font-semibold">Level</span>
            <select value={levelPref} onChange={(e) => setLevel(e.target.value)} className="rounded-lg border-2 border-line bg-bg px-2 py-1">
              <option value="auto">Auto ({autoLevel})</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {models.length > 1 && (
            <label className="flex items-center justify-between gap-2">
              <span className="font-semibold">Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="w-36 truncate rounded-lg border-2 border-line bg-bg px-2 py-1 text-xs">
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button
              className="btn btn-ghost flex-1 !px-2 text-xs"
              onClick={() => {
                started.current.delete(scenarioId);
                clear(scenarioId);
              }}
              disabled={busy}
            >
              <RotateCcw size={13} /> New chat
            </button>
            <button
              className="btn btn-ghost !px-2 text-xs !text-bad"
              aria-label="Disconnect key"
              onClick={() => confirm("Remove your Gemini key and all tutor chats from this browser?") && forget()}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </aside>

      <section className="card flex h-[calc(100vh-14rem)] min-h-[480px] min-w-0 flex-col overflow-hidden">
        <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-7">
          {messages.map((m) => (m.role === "tutor" ? <TutorBubble key={m.id} m={m} showEn={!!showEn[m.id]} onToggle={() => setShowEn((s) => ({ ...s, [m.id]: !s[m.id] }))} added={added} onAdd={(w) => {
            const ok = addCustomWord({ de: w.de, en: w.en, pos: w.article === "none" ? "word" : "noun", gender: w.article === "der" ? "m" : w.article === "die" ? "f" : w.article === "das" ? "n" : undefined, ex: { de: m.text, en: m.reply?.translation ?? "" } });
            setAdded((a) => ({ ...a, [w.de]: true }));
            return ok;
          }} onUse={(t) => setInput(t)} /> : <UserBubble key={m.id} m={m} />))}
          {busy && (
            <div className="flex items-center gap-2 text-muted">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ember font-display font-bold text-white">L</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-2 w-2 rounded-full bg-muted" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />
                ))}
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 rounded-2xl bg-bad/10 p-3 text-sm">
              <AlertCircle size={16} className="shrink-0 text-bad" />
              <span className="flex-1">{error.message}</span>
              {error.kind !== "auth" && messages.length === 0 && (
                <button className="btn btn-ghost text-xs" onClick={() => run(null)}>
                  Retry
                </button>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="border-t border-line p-3 md:p-4">
          {pendingPron && (
            <p className="mb-2 px-1 text-xs text-muted">
              Pronunciation of what you said: <span className="font-bold" style={{ color: scoreColor(pendingPron.score) }}>{pendingPron.score}</span>
              {pendingPron.focus.length > 0 && ` · watch ${pendingPron.focus.map((f) => soundById.get(f)?.symbol ?? f).join(", ")}`}
            </p>
          )}
          <div className="flex items-end gap-2">
            {browserRecognitionAvailable && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={toggleMic}
                disabled={busy}
                aria-label={recording ? "Stop recording" : "Speak"}
                className={clsx("relative grid h-12 w-12 shrink-0 place-items-center rounded-full", recording ? "bg-ember text-white" : "bg-raised")}
              >
                {recording && <span className="absolute inset-0 rounded-full bg-ember animate-pulse-ring" />}
                {recording ? <Square size={18} fill="currentColor" className="relative" /> : <Mic size={20} />}
              </motion.button>
            )}
            <div className="flex-1 rounded-2xl border-2 border-line bg-bg focus-within:border-ink">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                lang="de"
                placeholder={recording ? "Listening…" : "Reply in German…"}
                className="block max-h-32 w-full resize-none bg-transparent px-4 py-3 outline-none"
              />
              <div className="flex gap-1 px-2 pb-2">
                {["ä", "ö", "ü", "ß"].map((ch) => (
                  <button key={ch} onClick={() => setInput((v) => v + ch)} className="h-7 w-7 rounded-lg text-sm hover:bg-raised">
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            <motion.button whileTap={{ scale: 0.92 }} onClick={send} disabled={!input.trim() || busy} aria-label="Send" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-[#17141f] disabled:opacity-40">
              <ArrowUp size={20} />
            </motion.button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TutorBubble({
  m,
  showEn,
  onToggle,
  added,
  onAdd,
  onUse,
}: {
  m: ChatMessage;
  showEn: boolean;
  onToggle: () => void;
  added: Record<string, boolean>;
  onAdd: (w: { de: string; en: string; article: "der" | "die" | "das" | "none" }) => boolean;
  onUse: (t: string) => void;
}) {
  const r = m.reply;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[92%] gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ember font-display font-bold text-white">L</span>
      <div className="min-w-0 space-y-2">
        <div className="rounded-3xl rounded-tl-md bg-raised px-5 py-3.5">
          <p className="text-lg leading-snug">{m.text}</p>
          <AnimatePresence>
            {showEn && r?.translation && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1 text-sm text-muted">
                {r.translation}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="mt-2 flex items-center gap-2">
            <PlayButton text={m.text} size="sm" />
            <PlayButton text={m.text} size="sm" slow />
            <button onClick={onToggle} className={clsx("chip", showEn && "!bg-ink !text-bg")}>
              <Languages size={12} /> EN
            </button>
          </div>
        </div>
        {r && r.new_words.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {r.new_words.map((w) => (
              <button
                key={w.de}
                disabled={added[w.de]}
                onClick={() => onAdd(w)}
                className={clsx("flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm", added[w.de] ? "border-good/40 text-good" : "border-line hover:border-ink")}
                title="Add to your flashcards"
              >
                {added[w.de] ? <Check size={13} /> : <Plus size={13} />}
                <span className="font-semibold">{w.article !== "none" ? `${w.article} ${w.de}` : w.de}</span>
                <span className="text-muted">{w.en}</span>
              </button>
            ))}
          </div>
        )}
        {r?.suggestion && (
          <button onClick={() => onUse(r.suggestion)} className="text-left text-sm text-muted hover:text-ink">
            Try saying: <span className="italic">“{r.suggestion}”</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="ml-auto flex max-w-[88%] flex-col items-end gap-2">
      <div className="rounded-3xl rounded-tr-md bg-ink px-5 py-3 text-bg">
        <p className="text-lg leading-snug">{m.text}</p>
      </div>
      {m.pronunciation && (
        <span className="chip">
          Pronunciation <b style={{ color: scoreColor(m.pronunciation.score) }}>{m.pronunciation.score}</b>
          {m.pronunciation.focus.length > 0 && ` · ${m.pronunciation.focus.map((f) => soundById.get(f)?.symbol ?? f).join(", ")}`}
        </span>
      )}
      {m.corrections && m.corrections.length > 0 && (
        <div className="w-full space-y-2 rounded-2xl border-2 border-gold/50 bg-gold/10 p-3 text-sm">
          {m.corrections.map((c, i) => (
            <div key={i}>
              <p>
                <span className="text-bad line-through decoration-2">{c.you_said}</span> → <span className="font-semibold">{c.better}</span>
              </p>
              <p className="text-muted">{c.why}</p>
            </div>
          ))}
        </div>
      )}
      {m.corrections && m.corrections.length === 0 && (
        <span className="flex items-center gap-1 text-xs text-good">
          <Check size={12} /> No mistakes
        </span>
      )}
    </motion.div>
  );
}
