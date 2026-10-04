import alphabetJson from "@content/alphabet.json";
import soundsJson from "@content/sounds.json";
import curriculumJson from "@content/curriculum.json";
import paragraphsJson from "@content/paragraphs.json";
import type { Deck, Gender, Lesson, Letter, Level, Paragraph, Sound, Unit, VocabCard } from "./types";

export const alphabet = alphabetJson as Letter[];
export const sounds = soundsJson as Sound[];
const LEVEL_ORDER = ["a1", "a2", "b1", "b2", "c1"];
const byLevel = (path: string) => LEVEL_ORDER.indexOf(path.match(/_(\w\d)\.json$/)?.[1] ?? "");
const vocabFiles = import.meta.glob<Deck[]>("../../../content/vocab_*.json", { eager: true, import: "default" });
const lessonFiles = import.meta.glob<Lesson[]>("../../../content/lessons_*.json", { eager: true, import: "default" });
const ordered = <T,>(files: Record<string, T[]>) =>
  Object.entries(files)
    .sort(([a], [b]) => byLevel(a) - byLevel(b))
    .flatMap(([, v]) => v);

export const decks = ordered(vocabFiles);
export const levels = (curriculumJson as { levels: Level[] }).levels;
const unitOrder = new Map(levels.flatMap((l) => l.units).map((u, i) => [u.id, i]));
export const lessons = ordered(lessonFiles).sort((a, b) => (unitOrder.get(a.unit) ?? 0) - (unitOrder.get(b.unit) ?? 0) || a.id.localeCompare(b.id));
export const paragraphs = paragraphsJson as Paragraph[];

export const soundById = new Map(sounds.map((s) => [s.id, s]));
export const deckById = new Map(decks.map((d) => [d.id, d]));
export const lessonById = new Map(lessons.map((l) => [l.id, l]));

export const units: (Unit & { level: string })[] = levels.flatMap((l) => l.units.map((u) => ({ ...u, level: l.id })));
export const unitById = new Map(units.map((u) => [u.id, u]));

export function lessonsForUnit(unitId: string): Lesson[] {
  return lessons.filter((l) => l.unit === unitId);
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const cards: VocabCard[] = decks.flatMap((d) => d.words.map((w) => ({ ...w, id: `${d.id}:${slug(w.de)}-${w.pos}`, deckId: d.id })));
export const cardById = new Map(cards.map((c) => [c.id, c]));

export const ARTICLE: Record<Gender, string> = { m: "der", f: "die", n: "das", pl: "die" };

export function withArticle(word: { de: string; gender?: Gender }): string {
  return word.gender ? `${ARTICLE[word.gender]} ${word.de}` : word.de;
}

export const GENDER_COLOR: Record<Gender, string> = {
  m: "var(--color-der)",
  f: "var(--color-die)",
  n: "var(--color-das)",
  pl: "var(--color-plural)",
};

export const GENDER_LABEL: Record<Gender, string> = { m: "masculine", f: "feminine", n: "neuter", pl: "plural only" };

export const lessonOrder: string[] = units.flatMap((u) => lessonsForUnit(u.id).map((l) => l.id));
