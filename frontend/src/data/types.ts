export type Gender = "m" | "f" | "n" | "pl";

export interface Example {
  de: string;
  en: string;
}

export interface Letter {
  letter: string;
  name: string;
  ipa: string;
  sound: string;
  example: Example;
  tip: string;
}

export interface Sound {
  id: string;
  symbol: string;
  title: string;
  ipa: string;
  category: "vowel" | "consonant" | "pattern";
  howTo: string;
  trap: string;
  examples: Example[];
  pairs: [string, string][];
}

export interface Word {
  de: string;
  en: string;
  pos: string;
  gender?: Gender;
  plural?: string;
  ex: Example;
}

export interface Deck {
  id: string;
  level: string;
  title: string;
  titleDe: string;
  icon: string;
  words: Word[];
}

export interface VocabCard extends Word {
  id: string;
  deckId: string;
}

export interface Unit {
  id: string;
  title: string;
  titleDe: string;
  goal: string;
  grammar: string[];
  decks: string[];
  sounds: string[];
}

export interface Level {
  id: string;
  title: string;
  summary: string;
  units: Unit[];
}

export type Step =
  | { type: "intro"; title: string; body: string; points?: string[]; table?: [string, string][] }
  | { type: "phrase"; de: string; en: string; note?: string }
  | { type: "choice"; prompt: string; options: string[]; answer: number; explain?: string }
  | { type: "build"; en: string; answer: string[]; extra: string[] }
  | { type: "listen"; de: string; en: string }
  | { type: "speak"; de: string; en: string }
  | { type: "match"; pairs: [string, string][] };

export interface Lesson {
  id: string;
  unit: string;
  title: string;
  steps: Step[];
}

export interface Paragraph {
  id: string;
  level: string;
  title: string;
  de: string;
  en: string;
}
