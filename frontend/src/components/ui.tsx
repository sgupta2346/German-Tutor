import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  Clock,
  Coffee,
  Hash,
  Heart,
  Home,
  Hand,
  HelpCircle,
  Palette,
  Sparkles,
  Train,
  Users,
  Volume2,
  VolumeX,
  Snail,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { dismissAudioError, speak, useAudioError, useSpeaking } from "@/lib/audio";
import { GENDER_COLOR, GENDER_LABEL, ARTICLE } from "@/data/content";
import type { Gender } from "@/data/types";

export const DECK_ICONS: Record<string, LucideIcon> = {
  hand: Hand,
  hash: Hash,
  users: Users,
  coffee: Coffee,
  home: Home,
  clock: Clock,
  palette: Palette,
  train: Train,
  zap: Zap,
  sparkles: Sparkles,
  help: HelpCircle,
  heart: Heart,
};

export function PlayButton({
  text,
  size = "md",
  slow = false,
  className,
  label,
  gender,
}: {
  text: string;
  gender?: "female" | "male";
  size?: "sm" | "md" | "lg";
  slow?: boolean;
  className?: string;
  label?: string;
}) {
  const speaking = useSpeaking(text, slow);
  const dims = { sm: "h-9 w-9", md: "h-12 w-12", lg: "h-16 w-16" }[size];
  const icon = { sm: 16, md: 20, lg: 28 }[size];
  const Icon = slow ? Snail : Volume2;
  return (
    <button
      type="button"
      aria-label={label ?? (slow ? `Play slowly: ${text}` : `Play: ${text}`)}
      title={slow ? "Play slowly" : "Play"}
      onClick={(e) => {
        e.stopPropagation();
        speak(text, { slow, gender });
      }}
      className={clsx(
        "relative grid shrink-0 place-items-center rounded-full transition-colors",
        dims,
        speaking ? "bg-gold text-[#17141f]" : "bg-raised text-ink hover:bg-gold/30",
        className,
      )}
    >
      {speaking && <span className="absolute inset-0 rounded-full bg-gold animate-pulse-ring" />}
      <Icon size={icon} className="relative" />
    </button>
  );
}

export function GenderTag({ gender, className }: { gender?: Gender; className?: string }) {
  if (!gender) return null;
  return (
    <span
      className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide text-white", className)}
      style={{ background: GENDER_COLOR[gender] }}
      title={GENDER_LABEL[gender]}
    >
      {ARTICLE[gender]}
    </span>
  );
}

export function ProgressBar({ value, className, color = "var(--color-gold)" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={clsx("h-3 w-full overflow-hidden rounded-full bg-raised", className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

export function Ring({
  value,
  size = 120,
  stroke = 10,
  color = "var(--color-gold)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--raised)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function scoreColor(score: number): string {
  if (score >= 85) return "var(--color-good)";
  if (score >= 65) return "var(--color-gold)";
  return "var(--color-bad)";
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-ember">{eyebrow}</p>}
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-balance md:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted">{children}</div>}
    </header>
  );
}

export function AudioErrorToast() {
  const error = useAudioError();
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          role="alert"
          className="fixed inset-x-4 bottom-24 z-[80] mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm shadow-2xl lg:bottom-8"
        >
          <VolumeX size={18} className="mt-0.5 shrink-0 text-ember" />
          <span className="flex-1">{error}</span>
          <button onClick={dismissAudioError} className="font-semibold text-muted hover:text-ink">
            OK
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
