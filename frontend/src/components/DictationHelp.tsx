import { AnimatePresence, motion } from "motion/react";
import { Eye, Lightbulb } from "lucide-react";
import { speak } from "@/lib/audio";
import { PlayButton } from "./ui";

export function hintFor(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => {
      const m = w.match(/^([^A-Za-zÄÖÜäöüß]*)([A-Za-zÄÖÜäöüß-]+)(.*)$/);
      if (!m) return w;
      const [, pre, word, post] = m;
      return `${pre}${word[0]}${"_".repeat(Math.max(1, word.length - 1))}${post}`;
    })
    .join("  ");
}

export function TappableSentence({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-1.5 gap-y-1 ${className}`}>
      {text.split(/\s+/).map((w, i) => (
        <button
          key={i}
          type="button"
          onClick={() => speak(w.replace(/[.,!?;:„“"]/g, ""), { slow: true })}
          className="rounded-lg px-1 transition-colors hover:bg-gold/30"
          title="Hear this word"
        >
          {w}
        </button>
      ))}
    </p>
  );
}

export function DictationHelp({
  text,
  en,
  hint,
  revealed,
  onHint,
  onReveal,
  disabled = false,
}: {
  text: string;
  en: string;
  hint: boolean;
  revealed: boolean;
  onHint: () => void;
  onReveal: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      {!revealed && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled || hint} onClick={onHint} className="btn btn-ghost text-sm">
            <Lightbulb size={15} /> Hint
          </button>
          <button type="button" disabled={disabled} onClick={onReveal} className="btn btn-ghost text-sm">
            <Eye size={15} /> Show answer
          </button>
        </div>
      )}
      <AnimatePresence>
        {hint && !revealed && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 font-mono text-lg tracking-wide text-muted">
            {hintFor(text)}
          </motion.p>
        )}
        {revealed && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-1 rounded-2xl border-2 border-gold/50 bg-gold/10 p-4">
            <div className="flex items-start gap-3">
              <PlayButton text={text} size="sm" />
              <div className="min-w-0">
                <TappableSentence text={text} className="font-display text-xl font-bold" />
                <p className="mt-1 text-muted">{en}</p>
                <p className="mt-2 text-xs text-muted">Tap any word to hear it on its own. Then try typing the sentence yourself.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
