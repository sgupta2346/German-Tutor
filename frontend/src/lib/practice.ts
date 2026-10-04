import { cards, lessons, paragraphs, sounds, withArticle } from "@/data/content";
import { hasReference, tokenize } from "./phonetics";
import type { SoundStat } from "./store";

const PATTERNS: Record<string, RegExp> = {
  ue: /ü/,
  oe: /ö/,
  ae: /ä/,
  ich: /(?:[eiäöüylnr]|ei|eu|äu)ch|ig$/,
  ach: /(?:^|[^e])(?:a|o|u|au)ch/,
  r: /^r|[^e]r[aeiouäöüy]|[bdfgkpt]r/,
  er: /er$|[aeiouäöü]r$/,
  z: /z/,
  w: /^w|[^a-z]w/,
  v: /^v[aeiouo]|^vie|^vor|^ver|^von/,
  "s-voiced": /^s[aeiouäöü]|[aeiouäöül n]s[aeiouäöü]/,
  "sp-st": /^s[pt]|^(?:ver|be|ge|auf|aus|an|zu)s[pt]/,
  sch: /sch/,
  devoicing: /[bdg]$/,
  ig: /ig$/,
  "ei-ie": /ei|ie/,
  eu: /eu|äu/,
  au: /au/,
  pf: /pf/,
  ng: /ng/,
  schwa: /[^aeiouäöü]e$/,
  qu: /qu/,
};

export const PRACTICE_RULES = Object.keys(PATTERNS).filter((r) => sounds.some((s) => s.id === r));

export function rulesInText(text: string): string[] {
  const words = tokenize(text).map((w) => w.toLowerCase());
  return PRACTICE_RULES.filter((rule) => words.some((w) => PATTERNS[rule].test(w)));
}

export interface PracticeItem {
  de: string;
  en: string;
  tier: 1 | 2 | 3;
}

let pool: (PracticeItem & { rules: string[] })[] | null = null;

function buildPool() {
  const seen = new Set<string>();
  const items: (PracticeItem & { rules: string[] })[] = [];
  const add = (de: string, en: string) => {
    const key = de.trim();
    if (!key || seen.has(key) || !hasReference(key)) return;
    seen.add(key);
    const n = tokenize(key).length;
    const tier: 1 | 2 | 3 = n <= 2 ? 1 : n <= 8 ? 2 : 3;
    items.push({ de: key, en, tier, rules: rulesInText(key) });
  };
  for (const s of sounds) {
    for (const e of s.examples) add(e.de, e.en);
    for (const [a, b] of s.pairs) {
      add(a, `contrast with ${b}`);
      add(b, `contrast with ${a}`);
    }
  }
  for (const c of cards) {
    add(withArticle(c), c.en);
    add(c.ex.de, c.ex.en);
  }
  for (const l of lessons) for (const s of l.steps) if ("de" in s) add(s.de, s.en);
  for (const p of paragraphs) add(p.de, p.en);
  return items;
}

function getPool() {
  pool ??= buildPool();
  return pool;
}

export function mastery(stat: SoundStat | undefined): number | null {
  if (!stat || stat.tries < 3) return null;
  const recent = stat.recent.length ? stat.recent : [];
  const ok = recent.reduce((a, b) => a + b, 0);
  return (ok + 1) / (recent.length + 2);
}

export function weakestSounds(stats: Record<string, SoundStat>, n = 3): { rule: string; mastery: number; tries: number }[] {
  return Object.entries(stats)
    .map(([rule, st]) => ({ rule, mastery: mastery(st), tries: st.tries }))
    .filter((x): x is { rule: string; mastery: number; tries: number } => x.mastery !== null && x.mastery < 0.9 && PRACTICE_RULES.includes(x.rule))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, n);
}

export function tierFor(m: number | null): 1 | 2 | 3 {
  if (m === null || m < 0.5) return 1;
  if (m < 0.8) return 2;
  return 3;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function drillFor(rule: string, stat: SoundStat | undefined, count = 8): PracticeItem[] {
  const target = tierFor(mastery(stat));
  const matching = getPool().filter((i) => i.rules.includes(rule));
  const ranked = [...shuffle(matching.filter((i) => i.tier === target)), ...shuffle(matching.filter((i) => i.tier === Math.max(1, target - 1))), ...shuffle(matching.filter((i) => i.tier === Math.min(3, target + 1)))];
  const out: PracticeItem[] = [];
  const seen = new Set<string>();
  for (const i of ranked) {
    if (seen.has(i.de)) continue;
    seen.add(i.de);
    out.push({ de: i.de, en: i.en, tier: i.tier });
    if (out.length >= count) break;
  }
  return out;
}

export function diagnosticSet(count = 8): PracticeItem[] {
  const covered = new Set<string>();
  const candidates = shuffle(getPool().filter((i) => i.tier === 2));
  const out: PracticeItem[] = [];
  while (out.length < count) {
    let best: (typeof candidates)[number] | null = null;
    let gain = -1;
    for (const c of candidates) {
      const g = c.rules.filter((r) => !covered.has(r)).length;
      if (g > gain && !out.some((o) => o.de === c.de)) {
        best = c;
        gain = g;
      }
    }
    if (!best) break;
    best.rules.forEach((r) => covered.add(r));
    out.push({ de: best.de, en: best.en, tier: best.tier });
  }
  return out;
}

export function itemCount(rule: string): number {
  return getPool().filter((i) => i.rules.includes(rule)).length;
}
