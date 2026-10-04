import alphabetJson from "@content/alphabet.json";
import soundsJson from "@content/sounds.json";
import vocabA1 from "@content/vocab_a1.json";
import curriculumJson from "@content/curriculum.json";
import lessonsA1 from "@content/lessons_a1.json";
import paragraphsJson from "@content/paragraphs.json";
import type { Deck, Gender, Lesson, Letter, Level, Paragraph, Sound, Unit, VocabCard } from "./types";

export const alphabet = alphabetJson as Letter[];
export const sounds = soundsJson as Sound[];
export const decks = vocabA1 as Deck[];
export const levels = (curriculumJson as { levels: Level[] }).levels;
export const lessons = lessonsA1 as Lesson[];
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
