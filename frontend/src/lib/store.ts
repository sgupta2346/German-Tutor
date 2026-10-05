import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CardInput } from "ts-fsrs";

export type Theme = "system" | "light" | "dark";

export interface Attempt {
  text: string;
  score: number;
  at: number;
  focus: string[];
}

export interface SoundStat {
  tries: number;
  misses: number;
  recent: number[];
}

export interface CustomWord {
  id: string;
  de: string;
  en: string;
  pos: string;
  gender?: "m" | "f" | "n" | "pl";
  ex: { de: string; en: string };
  addedAt: number;
}

export interface LessonResult {
  stars: number;
  at: number;
}

export interface Settings {
  theme: Theme;
  rate: number;
  voice: string;
  voiceURI: string | null;
  autoplay: boolean;
  dailyGoal: number;
  newPerDay: number;
}

interface State {
  name: string;
  xp: number;
  xpByDay: Record<string, number>;
  streak: number;
  lastActive: string | null;
  lessons: Record<string, LessonResult>;
  srs: Record<string, CardInput>;
  newIntroduced: Record<string, number>;
  attempts: Attempt[];
  soundStats: Record<string, SoundStat>;
  customWords: CustomWord[];
  settings: Settings;
  onboarded: boolean;
  recordSounds: (present: string[], missed: string[]) => void;
  addCustomWord: (word: Omit<CustomWord, "id" | "addedAt">) => boolean;
  removeCustomWord: (id: string) => void;
  addXp: (amount: number) => void;
  completeLesson: (id: string, stars: number) => void;
  saveCard: (id: string, card: CardInput, wasNew: boolean) => void;
  logAttempt: (attempt: Attempt) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setName: (name: string) => void;
  finishOnboarding: () => void;
  importState: (data: unknown) => boolean;
  reset: () => void;
}

export function today(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

const initial = {
  name: "",
  xp: 0,
  xpByDay: {} as Record<string, number>,
  streak: 0,
  lastActive: null as string | null,
  lessons: {} as Record<string, LessonResult>,
  srs: {} as Record<string, CardInput>,
  newIntroduced: {} as Record<string, number>,
  attempts: [] as Attempt[],
  soundStats: {} as Record<string, SoundStat>,
  customWords: [] as CustomWord[],
  onboarded: false,
  settings: { theme: "light", rate: 1, voice: "thorsten", voiceURI: null, autoplay: true, dailyGoal: 50, newPerDay: 15 } as Settings,
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      addXp: (amount) => {
        const day = today();
        const { lastActive, streak, xpByDay } = get();
        let nextStreak = streak;
        if (lastActive !== day) {
          nextStreak = lastActive && dayDiff(lastActive, day) === 1 ? streak + 1 : 1;
        }
        set({
          xp: get().xp + amount,
          xpByDay: { ...xpByDay, [day]: (xpByDay[day] ?? 0) + amount },
          streak: nextStreak,
          lastActive: day,
        });
      },
      completeLesson: (id, stars) => {
        const prev = get().lessons[id];
        set({ lessons: { ...get().lessons, [id]: { stars: Math.max(stars, prev?.stars ?? 0), at: Date.now() } } });
      },
      saveCard: (id, card, wasNew) => {
        const day = today();
        set({
          srs: { ...get().srs, [id]: card },
          newIntroduced: wasNew ? { ...get().newIntroduced, [day]: (get().newIntroduced[day] ?? 0) + 1 } : get().newIntroduced,
        });
      },
      recordSounds: (present, missed) => {
        if (!present.length) return;
        const stats = { ...get().soundStats };
        for (const rule of present) {
          const prev = stats[rule] ?? { tries: 0, misses: 0, recent: [] };
          const miss = missed.includes(rule);
          stats[rule] = { tries: prev.tries + 1, misses: prev.misses + (miss ? 1 : 0), recent: [...prev.recent, miss ? 0 : 1].slice(-12) };
        }
        set({ soundStats: stats });
      },
      addCustomWord: (word) => {
        const key = word.de.trim().toLowerCase();
        if (!key || get().customWords.some((w) => w.de.toLowerCase() === key)) return false;
        set({ customWords: [...get().customWords, { ...word, id: `tutor:${key.replace(/\s+/g, "-")}`, addedAt: Date.now() }] });
        return true;
      },
      removeCustomWord: (id) => set({ customWords: get().customWords.filter((w) => w.id !== id) }),
      logAttempt: (attempt) => set({ attempts: [attempt, ...get().attempts].slice(0, 300) }),
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      setName: (name) => set({ name }),
      finishOnboarding: () => set({ onboarded: true }),
      importState: (data) => {
        if (!data || typeof data !== "object" || !("state" in data)) return false;
        const state = (data as { state: Partial<State> }).state;
        if (typeof state.xp !== "number" || typeof state.srs !== "object") return false;
        set({ ...initial, ...state, settings: { ...initial.settings, ...(state.settings ?? {}) } });
        return true;
      },
      reset: () => set({ ...initial }),
    }),
    {
      name: "klang-progress",
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<State>;
        if (version < 2 && p.settings?.theme === "system") p.settings = { ...p.settings, theme: "light" };
        return p as State;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return { ...current, ...p, settings: { ...current.settings, ...(p.settings ?? {}) } };
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        name: s.name,
        xp: s.xp,
        xpByDay: s.xpByDay,
        streak: s.streak,
        lastActive: s.lastActive,
        lessons: s.lessons,
        srs: s.srs,
        newIntroduced: s.newIntroduced,
        attempts: s.attempts,
        soundStats: s.soundStats,
        customWords: s.customWords,
        settings: s.settings,
        onboarded: s.onboarded,
      }),
    },
  ),
);

export function currentStreak(streak: number, lastActive: string | null): number {
  if (!lastActive) return 0;
  return dayDiff(lastActive, today()) <= 1 ? streak : 0;
}
