import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { speak } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { Logo } from "./AppShell";

const GOALS = [
  { xp: 20, label: "Casual", hint: "5 min a day" },
  { xp: 50, label: "Regular", hint: "10 min a day" },
  { xp: 100, label: "Serious", hint: "20 min a day" },
];

export function Onboarding() {
  const onboarded = useStore((s) => s.onboarded);
  const { setName, updateSettings, finishOnboarding } = useStore();
  const [step, setStep] = useState(0);
  const [name, setLocalName] = useState("");
  const [goal, setGoal] = useState(50);

  return (
    <AnimatePresence>
      {!onboarded && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center bg-bg/95 p-6 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div key={step} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center">
            <div className="flex justify-center">
              <Logo />
            </div>
            {step === 0 && (
              <>
                <h1 className="mt-10 font-display text-5xl font-extrabold tracking-tight">Willkommen!</h1>
                <p className="mt-3 text-lg text-muted">Learn German from the alphabet up, and learn to actually sound German while you do it.</p>
                <button
                  className="btn btn-gold mt-10 w-full"
                  onClick={() => {
                    speak("Willkommen! Schön, dass du da bist.");
                    setStep(1);
                  }}
                >
                  Los geht's
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <h1 className="mt-10 font-display text-4xl font-extrabold">Wie heißt du?</h1>
                <p className="mt-2 text-muted">What's your name?</p>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setLocalName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setStep(2)}
                  placeholder="Ich heiße…"
                  className="mt-8 w-full rounded-2xl border-2 border-line bg-surface px-5 py-4 text-center text-xl outline-none focus:border-ink"
                />
                <button className="btn btn-gold mt-6 w-full" onClick={() => setStep(2)}>
                  Weiter
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className="mt-10 font-display text-4xl font-extrabold">Pick a daily goal</h1>
                <div className="mt-8 grid gap-3">
                  {GOALS.map((g) => (
                    <button
                      key={g.xp}
                      onClick={() => setGoal(g.xp)}
                      className={clsx("flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left", goal === g.xp ? "border-ink bg-gold/20" : "border-line bg-surface")}
                    >
                      <span className="font-semibold">{g.label}</span>
                      <span className="text-sm text-muted">{g.hint}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-gold mt-8 w-full"
                  onClick={() => {
                    setName(name.trim());
                    updateSettings({ dailyGoal: goal });
                    finishOnboarding();
                  }}
                >
                  Start learning
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
