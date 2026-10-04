import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const API = "https://generativelanguage.googleapis.com/v1beta";

export interface Correction {
  you_said: string;
  better: string;
  why: string;
}

export interface NewWord {
  de: string;
  en: string;
  article: "der" | "die" | "das" | "none";
}

export interface TutorReply {
  reply: string;
  translation: string;
  corrections: Correction[];
  new_words: NewWord[];
  suggestion: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "tutor";
  text: string;
  reply?: TutorReply;
  corrections?: Correction[];
  pronunciation?: { score: number; focus: string[] };
  at: number;
}

export interface Scenario {
  id: string;
  title: string;
  titleDe: string;
  setup: string;
}

export const SCENARIOS: Scenario[] = [
  { id: "smalltalk", title: "Small talk", titleDe: "Kennenlernen", setup: "You just met the learner at a language exchange evening in Berlin. Get to know each other." },
  { id: "cafe", title: "At a café", titleDe: "Im Café", setup: "You are a waiter in a Berlin café. The learner is a customer ordering food and drinks and paying." },
  { id: "doctor", title: "At the doctor", titleDe: "Beim Arzt", setup: "You are a doctor's receptionist and then the doctor. The learner is a patient describing symptoms." },
  { id: "flat", title: "Flat hunting", titleDe: "Wohnungssuche", setup: "You are a landlord showing a flat. The learner is interested in renting it and asks questions." },
  { id: "station", title: "At the station", titleDe: "Am Bahnhof", setup: "You work at a Deutsche Bahn ticket counter. The learner needs a ticket and directions to the right platform." },
  { id: "interview", title: "Job interview", titleDe: "Vorstellungsgespräch", setup: "You are interviewing the learner for an office job at a German company. Be formal and use Sie." },
  { id: "free", title: "Free conversation", titleDe: "Freies Gespräch", setup: "Have a relaxed conversation about whatever the learner wants to talk about: hobbies, travel, news, plans." },
];

interface TutorState {
  apiKey: string;
  model: string;
  level: string;
  chats: Record<string, ChatMessage[]>;
  setKey: (key: string, model: string) => void;
  setModel: (model: string) => void;
  setLevel: (level: string) => void;
  append: (scenario: string, msg: ChatMessage) => void;
  patch: (scenario: string, id: string, patch: Partial<ChatMessage>) => void;
  clear: (scenario: string) => void;
  forget: () => void;
}

export const useTutor = create<TutorState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      model: "",
      level: "auto",
      chats: {},
      setKey: (apiKey, model) => set({ apiKey, model }),
      setModel: (model) => set({ model }),
      setLevel: (level) => set({ level }),
      append: (scenario, msg) => set({ chats: { ...get().chats, [scenario]: [...(get().chats[scenario] ?? []), msg].slice(-80) } }),
      patch: (scenario, id, p) => set({ chats: { ...get().chats, [scenario]: (get().chats[scenario] ?? []).map((m) => (m.id === id ? { ...m, ...p } : m)) } }),
      clear: (scenario) => set({ chats: { ...get().chats, [scenario]: [] } }),
      forget: () => set({ apiKey: "", model: "", chats: {} }),
    }),
    { name: "klang-tutor", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

export class TutorError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate" | "network" | "other",
  ) {
    super(message);
  }
}

async function call(path: string, key: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, { ...init, headers: { "Content-Type": "application/json", "x-goog-api-key": key, ...(init?.headers ?? {}) } });
  } catch {
    throw new TutorError("Couldn't reach Google's API. Check your connection.", "network");
  }
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  const message: string = body?.error?.message ?? res.statusText;
  if (res.status === 400 && /api key/i.test(message)) throw new TutorError("That API key isn't valid.", "auth");
  if (res.status === 401 || res.status === 403) throw new TutorError("That API key isn't allowed to use Gemini.", "auth");
  if (res.status === 429) throw new TutorError("You've hit the free tier's rate limit. Wait a minute and try again.", "rate");
  throw new TutorError(message || "The tutor request failed.", "other");
}

function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export async function listFlashModels(key: string): Promise<string[]> {
  const data = await call("models?pageSize=200", key);
  const names: string[] = (data.models ?? [])
    .filter((m: { name: string; supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m: { name: string }) => m.name.replace(/^models\//, ""))
    .filter((n: string) => /flash/.test(n) && !/image|tts|audio|live|embedding|vision|robotics|computer/.test(n));
  const penalty = (n: string) => (/lite/.test(n) ? 1 : 0) + (/preview|exp/.test(n) ? 2 : 0);
  return names.sort((a, b) => versionOf(b) - versionOf(a) || penalty(a) - penalty(b) || a.localeCompare(b));
}

const LEVEL_STYLE: Record<string, string> = {
  A1: "Use only very simple present-tense sentences of at most 8 words and the most common words. Speak slowly and clearly.",
  A2: "Use simple everyday sentences, Perfekt for the past, and common vocabulary. At most 12 words per sentence.",
  B1: "Speak naturally with subordinate clauses and common idioms, but avoid rare words.",
  B2: "Speak at natural native level with varied vocabulary and some colloquial expressions.",
  C1: "Speak like an educated native speaker, with idioms, modal particles and nuance.",
};

export function systemPrompt(opts: { level: string; scenario: Scenario; name: string; weakSounds: string[] }): string {
  return `You are Lena, a warm, encouraging German tutor from Berlin, practising spoken German with an adult native English speaker${opts.name ? ` called ${opts.name}` : ""}.

Situation: ${opts.scenario.setup}
Learner level: ${opts.level}. ${LEVEL_STYLE[opts.level] ?? LEVEL_STYLE.A1}

How to reply:
- "reply": your next line in German, in character, 1 to 3 sentences, ending with a question or prompt that keeps the conversation going. Standard German (Hochdeutsch).
- "translation": an English translation of your reply.
- "corrections": real mistakes in the learner's last message only (grammar, gender, case, word order, wrong word, missing umlaut). For each give the learner's words, the corrected German, and a one-sentence explanation in English. Ignore capitalisation-only and punctuation-only slips. Empty if there were no mistakes or this is the first turn.
- "new_words": up to 3 useful words from your reply the learner may not know at this level, with English and the article for nouns ("none" otherwise).
- "suggestion": one short, natural German sentence the learner could say next, at their level.
- If the learner writes in English or mixes languages, gently show how to say it in German in "corrections", then continue in German.
${opts.weakSounds.length ? `- The learner is working on these German sounds: ${opts.weakSounds.join(", ")}. When it fits naturally, use words containing them.` : ""}`;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    translation: { type: "STRING" },
    corrections: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { you_said: { type: "STRING" }, better: { type: "STRING" }, why: { type: "STRING" } }, required: ["you_said", "better", "why"] },
    },
    new_words: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { de: { type: "STRING" }, en: { type: "STRING" }, article: { type: "STRING", enum: ["der", "die", "das", "none"] } }, required: ["de", "en", "article"] },
    },
    suggestion: { type: "STRING" },
  },
  required: ["reply", "translation", "corrections", "new_words", "suggestion"],
};

export async function tutorTurn(key: string, model: string, system: string, history: ChatMessage[], userText: string | null): Promise<TutorReply> {
  const contents = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.role === "user" ? m.text : JSON.stringify(m.reply ?? { reply: m.text }) }],
  }));
  contents.push({ role: "user", parts: [{ text: userText ?? "(Start the conversation in character with a short greeting and a first question.)" }] });
  const data = await call(`models/${model}:generateContent`, key, {
    method: "POST",
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.8, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
  });
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new TutorError("The tutor didn't answer. Try again.", "other");
  try {
    const parsed = JSON.parse(text) as TutorReply;
    return { reply: parsed.reply ?? "", translation: parsed.translation ?? "", corrections: parsed.corrections ?? [], new_words: parsed.new_words ?? [], suggestion: parsed.suggestion ?? "" };
  } catch {
    throw new TutorError("The tutor's answer was garbled. Try again.", "other");
  }
}
