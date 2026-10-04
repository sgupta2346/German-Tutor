import phonemeTable from "@content/phonemes.json";

const STRIP = new Set(["ˈ", "ˌ", "‿", "͡", "̯", "̩", "-", "."]);
const VOWELS = new Set([..."aeiouyæøœɐɑɒɔəɛɜɪʊʏʌɨɵɯɤ"]);

const GROUPS: Set<string>[] = [
  ["y", "ʏ", "u", "ʊ", "i", "ɪ"],
  ["ø", "œ", "o", "ɔ", "e", "ɛ", "ə", "ɜ"],
  ["a", "ɑ", "æ", "ɐ", "ʌ", "ə", "ɜ"],
  ["ç", "ʃ", "x", "χ", "h", "k", "s"],
  ["ʁ", "r", "ɾ", "ɹ", "ʀ", "χ", "ɻ"],
  ["v", "w", "f", "b"],
  ["s", "z", "ʃ", "ʒ"],
  ["p", "b"],
  ["t", "d"],
  ["k", "ɡ", "g"],
  ["m", "n", "ŋ"],
  ["l", "ɫ"],
].map((g) => new Set(g));

const EQUIVALENT: Set<string>[] = [
  ["ʁ", "ʀ", "χ", "r", "ɾ"],
  ["ɐ", "ɐ̯", "ɜ"],
  ["a", "ɑ"],
  ["aː", "ɑː"],
  ["ɡ", "g"],
  ["l", "ɫ"],
].map((g) => new Set(g));

export function clean(phone: string): string {
  return [...phone.normalize("NFC")].filter((c) => !STRIP.has(c)).join("");
}

export function base(phone: string): string {
  return phone.replace(/[ːˑ]/g, "").replace(/ɑ/g, "a");
}

const isLong = (p: string) => p.includes("ː");
const isVowel = (p: string) => p.length > 0 && VOWELS.has(p[0]);

function equivalent(a: string, b: string): boolean {
  return a === b || EQUIVALENT.some((g) => g.has(a) && g.has(b));
}

export function substitutionCost(ref: string, hyp: string): number {
  if (equivalent(ref, hyp)) return 0;
  if (base(ref) === base(hyp)) return 0.4;
  if (GROUPS.some((g) => g.has(base(ref)) && g.has(base(hyp)))) return 0.7;
  if (isVowel(ref) !== isVowel(hyp)) return 1.2;
  return 1;
}

export function splitSequence(text: string): string[] {
  return text
    .split(/\s+/)
    .map(clean)
    .filter(Boolean);
}

export interface Op {
  kind: "match" | "sub" | "del" | "ins";
  ref: string | null;
  hyp: string | null;
  refIndex: number | null;
  cost: number;
}

const INSERT = 0.8;
const DELETE = 1;

export function align(ref: string[], hyp: string[], deleteCosts?: number[]): Op[] {
  const n = ref.length;
  const dc = deleteCosts ?? ref.map(() => DELETE);
  const m = hyp.length;
  const dist = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const back = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    dist[i][0] = dist[i - 1][0] + dc[i - 1];
    back[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    dist[0][j] = j * INSERT;
    back[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = dist[i - 1][j - 1] + substitutionCost(ref[i - 1], hyp[j - 1]);
      const del = dist[i - 1][j] + dc[i - 1];
      const ins = dist[i][j - 1] + INSERT;
      if (sub <= del && sub <= ins) {
        dist[i][j] = sub;
        back[i][j] = 0;
      } else if (del <= ins) {
        dist[i][j] = del;
        back[i][j] = 1;
      } else {
        dist[i][j] = ins;
        back[i][j] = 2;
      }
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = back[i][j];
    if (i > 0 && j > 0 && move === 0) {
      const cost = substitutionCost(ref[i - 1], hyp[j - 1]);
      ops.push({ kind: cost === 0 ? "match" : "sub", ref: ref[i - 1], hyp: hyp[j - 1], refIndex: i - 1, cost });
      i--;
      j--;
    } else if (i > 0 && (move === 1 || j === 0)) {
      ops.push({ kind: "del", ref: ref[i - 1], hyp: null, refIndex: i - 1, cost: dc[i - 1] });
      i--;
    } else {
      ops.push({ kind: "ins", ref: null, hyp: hyp[j - 1], refIndex: i > 0 ? i - 1 : null, cost: INSERT });
      j--;
    }
  }
  return ops.reverse();
}

const U_LIKE = new Set(["u", "ʊ", "i", "ɪ", "ju"]);
const O_LIKE = new Set(["o", "ɔ", "e", "ɛ", "ə", "ɜ", "oʊ", "ɚ", "ɝ"]);
const ENGLISH_R = new Set(["ɹ", "ɻ", "ɚ", "ɝ"]);
const GERMAN_R = new Set(["ʁ", "r", "ɾ", "ʀ", "χ"]);
const VOCALIC_R = new Set(["ɐ", "ɐ̯", "ɜ"]);
const VOICED: Record<string, string> = { p: "b", t: "d", k: "ɡ" };

function ruleForSub(ref: string, hyp: string, prev: string | null, next: string | null, prev2: string | null = null): string | null {
  const r = base(ref);
  const h = base(hyp);
  if ((r === "y" || r === "ʏ") && U_LIKE.has(h)) return "ue";
  if ((r === "ø" || r === "œ") && O_LIKE.has(h)) return "oe";
  if (r === "ɛ" && ["a", "æ", "eɪ"].includes(h)) return "ae";
  if (r === "ç" && ["ʃ", "k", "ɡ", "h", "x", "tʃ", "dʒ", "ʒ"].includes(h)) return (h === "k" || h === "ɡ") && prev === "ɪ" && prev2 !== null && next === null ? "ig" : "ich";
  if (r === "x" && (h === "k" || h === "h")) return "ach";
  if (GERMAN_R.has(ref) && ENGLISH_R.has(hyp)) return "r";
  if (VOCALIC_R.has(ref) && ENGLISH_R.has(hyp)) return "er";
  if (r === "ts" && ["z", "s", "dz"].includes(h)) return "z";
  if (r === "v" && h === "w") return prev === "k" ? "qu" : "w";
  if (r === "f" && h === "v") return "v";
  if (r === "z" && h === "s") return "s-voiced";
  if (r === "ʃ" && h === "s" && (next === "p" || next === "t")) return "sp-st";
  if (VOICED[r] && h === VOICED[r] && next === null) return "devoicing";
  if (r === "aɪ" && (h === "i" || h === "iː")) return "ei-ie";
  if (r === "i" && h === "aɪ") return "ei-ie";
  if (r === "ɔʏ" && ["ju", "u", "juː"].includes(h)) return "eu";
  if (r === "aʊ" && (h === "ɔ" || h === "ɑ" || h === "a")) return "au";
  if (r === "pf" && h === "f") return "pf";
  if (isVowel(ref) && base(ref) === base(hyp) && isLong(ref) !== isLong(hyp)) return "length";
  return null;
}

export interface Issue {
  kind: "sub" | "del" | "ins";
  expected: string | null;
  heard: string | null;
  word: number | null;
  rule: string | null;
}

export function diagnose(ops: Op[], wordOf: number[]): Issue[] {
  const refSeq = ops.filter((o) => o.ref !== null).map((o) => o.ref!) as string[];
  const neighbours = (idx: number): [string | null, string | null, string | null] => {
    const w = wordOf[idx];
    const prev = idx > 0 && wordOf[idx - 1] === w ? refSeq[idx - 1] : null;
    const prev2 = idx > 1 && wordOf[idx - 2] === w ? refSeq[idx - 2] : null;
    const next = idx + 1 < refSeq.length && wordOf[idx + 1] === w ? refSeq[idx + 1] : null;
    return [prev, next, prev2];
  };
  const issues: Issue[] = [];
  for (const op of ops) {
    if (op.kind === "match") continue;
    let rule: string | null = null;
    let word: number | null = null;
    if (op.kind === "sub" && op.refIndex !== null) {
      const [prev, next, prev2] = neighbours(op.refIndex);
      rule = ruleForSub(op.ref!, op.hyp!, prev, next, prev2);
      word = wordOf[op.refIndex];
    } else if (op.kind === "del" && op.refIndex !== null) {
      const [, next] = neighbours(op.refIndex);
      word = wordOf[op.refIndex];
      if (op.ref === "ə" && next === null) rule = "schwa";
      else if (op.ref === "ʔ") rule = "glottal";
      else if (op.ref === "p" && next === "f") rule = "pf";
    } else if (op.kind === "ins" && op.refIndex !== null && op.refIndex < refSeq.length) {
      word = wordOf[op.refIndex];
      const anchor = refSeq[op.refIndex];
      if (op.hyp === "ɡ" && anchor === "ŋ") rule = "ng";
      else if (op.hyp && ENGLISH_R.has(op.hyp) && VOCALIC_R.has(anchor)) rule = "er";
    }
    if (op.cost < 0.5 && rule === null) continue;
    issues.push({ kind: op.kind as Issue["kind"], expected: op.ref, heard: op.hyp, word, rule });
  }
  return issues;
}

const WORD = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

export function tokenize(text: string): string[] {
  return text.match(WORD) ?? [];
}

const table = phonemeTable as Record<string, string>;
const lowerTable = new Map(Object.entries(table).map(([k, v]) => [k.toLowerCase(), v]));

export function referencePhones(word: string): string[] | null {
  const hit = table[word] ?? lowerTable.get(word.toLowerCase());
  return hit === undefined ? null : splitSequence(hit);
}

export function hasReference(text: string): boolean {
  return tokenize(text).every((w) => referencePhones(w) !== null);
}

const SYLLABIC = new Set(["n", "l", "m"]);
const ELISION_COST = 0.2;

const norm = (w: string) => w.toLowerCase().replace(/ß/g, "ss");

export function wordMatches(expected: string[], heard: string[]): boolean[] {
  const pool = new Map<string, number>();
  for (const w of heard) pool.set(norm(w), (pool.get(norm(w)) ?? 0) + 1);
  return expected.map((w) => {
    const k = norm(w);
    const c = pool.get(k) ?? 0;
    if (c > 0) pool.set(k, c - 1);
    return c > 0;
  });
}

export interface WordResult {
  word: string;
  accuracy: number;
  understood: boolean | null;
  expected: string[];
  issues: Issue[];
}

export interface ScoreResult {
  score: number;
  phoneAccuracy: number;
  intelligibility: number | null;
  transcript: string | null;
  heardPhones: string[];
  words: WordResult[];
  focus: { rule: string; count: number }[];
  processingMs?: number;
  mode: "full" | "basic";
}

export function scoreAttempt(words: string[], refPhones: string[][], hyp: string[], transcript: string | null): ScoreResult {
  const flat: string[] = [];
  const wordOf: number[] = [];
  refPhones.forEach((p, w) => {
    flat.push(...p);
    wordOf.push(...p.map(() => w));
  });
  const deleteCosts = flat.map((p, k) => (p === "ə" && k + 1 < flat.length && wordOf[k + 1] === wordOf[k] && SYLLABIC.has(flat[k + 1]) ? ELISION_COST : 1));
  const ops = align(flat, hyp, deleteCosts);
  const issues = diagnose(ops, wordOf);
  const penalty = words.map(() => 0);
  for (const op of ops) {
    if (op.kind === "match" || op.refIndex === null || op.refIndex >= wordOf.length) continue;
    penalty[wordOf[op.refIndex]] += op.cost;
  }
  const understood: (boolean | null)[] = transcript !== null ? wordMatches(words, tokenize(transcript)) : words.map(() => null);
  const results: WordResult[] = words.map((word, i) => ({
    word,
    accuracy: Math.round(Math.max(0, 1 - penalty[i] / Math.max(1, refPhones[i].length)) * 1000) / 1000,
    understood: understood[i],
    expected: refPhones[i],
    issues: issues.filter((x) => x.word === i),
  }));
  const phoneAccuracy = Math.max(0, 1 - penalty.reduce((a, b) => a + b, 0) / Math.max(1, flat.length));
  const known = understood.filter((u): u is boolean => u !== null);
  const intelligibility = known.length ? known.filter(Boolean).length / known.length : null;
  const overall = intelligibility === null ? phoneAccuracy : 0.75 * phoneAccuracy + 0.25 * intelligibility;
  const counts = new Map<string, number>();
  for (const x of issues) if (x.rule) counts.set(x.rule, (counts.get(x.rule) ?? 0) + 1);
  return {
    score: Math.round(overall * 100),
    phoneAccuracy: Math.round(phoneAccuracy * 1000) / 1000,
    intelligibility: intelligibility === null ? null : Math.round(intelligibility * 1000) / 1000,
    transcript,
    heardPhones: hyp,
    words: results,
    focus: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([rule, count]) => ({ rule, count })),
    mode: "full",
  };
}
