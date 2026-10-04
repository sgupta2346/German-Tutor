import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { buildQueue, formatInterval, isDue, isNew, review } from "@/lib/srs";
import { basicScore, words } from "@/lib/scorer";
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
