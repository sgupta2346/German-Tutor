import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type CardInput, type Grade } from "ts-fsrs";
import { cards } from "@/data/content";
import type { VocabCard } from "@/data/types";
import { useStore } from "./store";

export const TUTOR_DECK = "tutor";
export const FLAGGED_DECK = "flagged";

export function allCards(): VocabCard[] {
  return [...cards, ...useStore.getState().customWords.map((w) => ({ ...w, deckId: TUTOR_DECK }))];
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true, request_retention: 0.9 }));

export const GRADES: { grade: Grade; label: string; key: string; tone: string }[] = [
  { grade: Rating.Again, label: "Again", key: "1", tone: "var(--color-bad)" },
  { grade: Rating.Hard, label: "Hard", key: "2", tone: "#f59e0b" },
  { grade: Rating.Good, label: "Good", key: "3", tone: "var(--color-good)" },
  { grade: Rating.Easy, label: "Easy", key: "4", tone: "var(--color-der)" },
];

function serialize(card: Card): CardInput {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function review(stored: CardInput | undefined, grade: Grade, now = new Date()): CardInput {
  const card = stored ?? createEmptyCard<Card>(now);
  return serialize(scheduler.next(card, now, grade).card);
}

export function preview(stored: CardInput | undefined, now = new Date()): Record<number, string> {
  const card = stored ?? createEmptyCard<Card>(now);
  const result = scheduler.repeat(card, now);
  const out: Record<number, string> = {};
  for (const { grade } of GRADES) out[grade] = formatInterval(new Date(result[grade].card.due).getTime() - now.getTime());
  return out;
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function isNew(card: CardInput | undefined): boolean {
  return !card || card.state === State.New || card.state === "New";
}

export function isDue(card: CardInput | undefined, now = new Date()): boolean {
  return !!card && !isNew(card) && new Date(card.due).getTime() <= now.getTime();
}

export function isMastered(card: CardInput | undefined): boolean {
  return !!card && (card.state === State.Review || card.state === "Review") && card.stability >= 21;
}

export interface QueueOptions {
  deckId?: string;
  newLimit: number;
  now?: Date;
}

export function buildQueue(srs: Record<string, CardInput>, { deckId, newLimit, now = new Date() }: QueueOptions): VocabCard[] {
  const { known, flagged } = useStore.getState();
  const every = allCards().filter((c) => !known[c.id]);
  if (deckId === FLAGGED_DECK) {
    const marked = every.filter((c) => flagged[c.id]);
    for (let i = marked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [marked[i], marked[j]] = [marked[j], marked[i]];
    }
    return marked;
  }
  const pool = deckId ? every.filter((c) => c.deckId === deckId) : every;
  const due = pool
    .filter((c) => isDue(srs[c.id], now))
    .sort((a, b) => new Date(srs[a.id].due).getTime() - new Date(srs[b.id].due).getTime());
  const fresh = pool.filter((c) => isNew(srs[c.id])).slice(0, Math.max(0, newLimit));
  const queue: VocabCard[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length || j < fresh.length) {
    if (i < due.length) queue.push(due[i++]);
    if (i < due.length) queue.push(due[i++]);
    if (j < fresh.length) queue.push(fresh[j++]);
  }
  return queue;
}

export function deckStats(srs: Record<string, CardInput>, deckId: string, now = new Date()) {
  const { known } = useStore.getState();
  const all = allCards().filter((c) => c.deckId === deckId);
  const pool = all.filter((c) => !known[c.id]);
  return {
    known: all.length - pool.length,
    total: all.length,
    fresh: pool.filter((c) => isNew(srs[c.id])).length,
    due: pool.filter((c) => isDue(srs[c.id], now)).length,
    mastered: pool.filter((c) => isMastered(srs[c.id])).length + (all.length - pool.length),
  };
}
