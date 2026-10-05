import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { buildQueue, formatInterval, isDue, isNew, review } from "@/lib/srs";
import { basicScore, words } from "@/lib/scorer";
import { scoreAttempt, referencePhones, tokenize as tok } from "@/lib/phonetics";
import { encodeWav } from "@/lib/recorder";
import { editDistance, normalizeAnswer } from "@/pages/LessonPlayer";
import { cards, decks, lessons, soundById, unitById, lessonById } from "@/data/content";

describe("spaced repetition", () => {
  it("moves a new card out of the new state after a review", () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const after = review(undefined, Rating.Good, now);
    expect(isNew(after)).toBe(false);
    expect(new Date(after.due).getTime()).toBeGreaterThan(now.getTime());
  });

  it("schedules Easy further out than Again", () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const again = review(undefined, Rating.Again, now);
    const easy = review(undefined, Rating.Easy, now);
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
  });

  it("puts due cards in the queue and caps new ones", () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const first = cards[0];
    const reviewed = review(undefined, Rating.Good, new Date("2026-09-01T10:00:00Z"));
    const queue = buildQueue({ [first.id]: reviewed }, { newLimit: 3, now });
    expect(isDue(reviewed, now)).toBe(true);
    expect(queue[0].id).toBe(first.id);
    expect(queue.filter((c) => c.id !== first.id)).toHaveLength(3);
  });

  it("formats intervals", () => {
    expect(formatInterval(5 * 60_000)).toBe("5m");
    expect(formatInterval(3 * 3_600_000)).toBe("3h");
    expect(formatInterval(10 * 86_400_000)).toBe("10d");
  });
});

describe("answer checking", () => {
  it("ignores case, punctuation and eszett spelling", () => {
    expect(normalizeAnswer("Die Straße, bitte!")).toBe(normalizeAnswer("die strasse bitte"));
  });

  it("computes edit distance", () => {
    expect(editDistance("danke", "dnake")).toBe(2);
    expect(editDistance("tag", "tag")).toBe(0);
  });
});

describe("basic scoring fallback", () => {
  it("scores by recognised words", () => {
    const r = basicScore("Ich heiße Anna.", "ich heisse anna");
    expect(r.score).toBe(100);
    expect(basicScore("Guten Tag", "guten").score).toBe(50);
  });

  it("splits German words with umlauts and hyphens", () => {
    expect(words("Die U-Bahn fährt!")).toEqual(["Die", "U-Bahn", "fährt"]);
  });
});

describe("wav encoding", () => {
  it("writes a valid 16-bit mono header", async () => {
    const blob = encodeWav(new Float32Array(1600), 16000);
    const view = new DataView(await blob.arrayBuffer());
    expect(blob.size).toBe(44 + 3200);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
  });
});

describe("content integrity", () => {
  it("gives every noun a gender", () => {
    const nouns = cards.filter((c) => c.pos === "noun");
    expect(nouns.every((c) => c.gender)).toBe(true);
  });

  it("has unique card ids", () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });

  it("links lessons to real units and units to real sounds and decks", () => {
    for (const l of lessons) expect(unitById.has(l.unit)).toBe(true);
    const deckIds = new Set(decks.map((d) => d.id));
    for (const u of unitById.values()) {
      for (const s of u.sounds) expect(soundById.has(s), s).toBe(true);
      for (const d of u.decks) expect(deckIds.has(d), d).toBe(true);
    }
  });

  it("has valid exercises", () => {
    for (const l of lessonById.values())
      for (const s of l.steps) {
        if (s.type === "choice") expect(s.answer).toBeLessThan(s.options.length);
        if (s.type === "match") expect(new Set(s.pairs.map((p) => p[0])).size).toBe(s.pairs.length);
      }
  });
});

describe("in-browser phonetics", () => {
  it("has reference phones for every German word used in the course", () => {
    const texts = [
      ...cards.flatMap((c) => [c.de, c.ex.de]),
      ...lessons.flatMap((l) => l.steps.flatMap((s) => ("de" in s ? [s.de] : []))),
    ];
    const missing = texts.flatMap(tok).filter((w) => referencePhones(w) === null);
    expect(missing).toEqual([]);
  });

  it("flags ü said as oo with the same rules as the server", () => {
    const r = scoreAttempt(["Tür"], [["t", "yː", "ɾ"]], ["t", "uː", "ʁ"], null);
    expect(r.words[0].issues.map((i) => i.rule)).toEqual(["ue"]);
  });

  it("accepts a native-like attempt", () => {
    const ref = referencePhones("richtig")!;
    expect(scoreAttempt(["richtig"], [ref], ref, "richtig").score).toBe(100);
  });

  it("detects English r and missing final devoicing", () => {
    const r = scoreAttempt(["rund"], [["r", "ʊ", "n", "t"]], ["ɹ", "ʊ", "n", "d"], null);
    expect(r.focus.map((f) => f.rule).sort()).toEqual(["devoicing", "r"]);
  });
});

describe("scoring calibration", () => {
  it("treats native schwa elision before n as nearly free", () => {
    const r = scoreAttempt(["einen"], [["aɪ", "n", "ə", "n"]], ["aɪ", "n", "n"], null);
    expect(r.phoneAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(r.focus).toEqual([]);
  });

  it("labels ich said as ick with the ich rule", () => {
    expect(scoreAttempt(["ich"], [["ɪ", "ç"]], ["ɪ", "k"], null).focus.map((f) => f.rule)).toEqual(["ich"]);
  });
});

import { useStore } from "@/lib/store";
import { FLAGGED_DECK } from "@/lib/srs";

describe("known and flagged words", () => {
  it("drops known words from every card queue and clears their flag", () => {
    const deckId = cards[0].deckId;
    const target = cards[0].id;
    useStore.getState().toggleFlag(target);
    useStore.getState().markKnown(target);
    expect(useStore.getState().flagged[target]).toBeUndefined();
    expect(buildQueue({}, { deckId, newLimit: 50 }).some((c) => c.id === target)).toBe(false);
    useStore.getState().unmarkKnown(target);
    expect(buildQueue({}, { deckId, newLimit: 50 }).some((c) => c.id === target)).toBe(true);
  });

  it("builds the flagged deck from all flagged words regardless of due dates", () => {
    const [a, b] = [cards[3].id, cards[40].id];
    useStore.getState().toggleFlag(a);
    useStore.getState().toggleFlag(b);
    const q = buildQueue({}, { deckId: FLAGGED_DECK, newLimit: 0 });
    expect(q.map((c) => c.id).sort()).toEqual([a, b].sort());
    useStore.getState().toggleFlag(a);
    expect(buildQueue({}, { deckId: FLAGGED_DECK, newLimit: 0 }).map((c) => c.id)).toEqual([b]);
  });
});
