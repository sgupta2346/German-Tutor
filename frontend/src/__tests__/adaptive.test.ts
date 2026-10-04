import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticSet, drillFor, mastery, rulesInText, tierFor, weakestSounds } from "@/lib/practice";
import { listFlashModels, systemPrompt, SCENARIOS, tutorTurn } from "@/lib/tutor";

describe("weak sound detection", () => {
  it("finds the sounds a sentence exercises", () => {
    const rules = rulesInText("Ich möchte über die Straße gehen.");
    expect(rules).toEqual(expect.arrayContaining(["ich", "oe", "ue", "sp-st", "ei-ie"]));
    expect(rules).not.toContain("ach");
  });

  it("separates ach and ich", () => {
    expect(rulesInText("Nacht")).toContain("ach");
    expect(rulesInText("Nacht")).not.toContain("ich");
    expect(rulesInText("richtig")).toEqual(expect.arrayContaining(["ich", "ig"]));
  });
});

describe("adaptive difficulty", () => {
  it("needs a few tries before judging a sound", () => {
    expect(mastery({ tries: 2, misses: 2, recent: [0, 0] })).toBeNull();
    expect(mastery({ tries: 6, misses: 6, recent: [0, 0, 0, 0, 0, 0] })!).toBeLessThan(0.2);
  });

  it("moves from words to sentences as mastery grows", () => {
    expect(tierFor(null)).toBe(1);
    expect(tierFor(0.3)).toBe(1);
    expect(tierFor(0.6)).toBe(2);
    expect(tierFor(0.9)).toBe(3);
  });

  it("ranks the weakest sounds first and skips mastered ones", () => {
    const weak = weakestSounds({
      ue: { tries: 8, misses: 6, recent: [0, 0, 1, 0, 0, 1, 0, 0] },
      r: { tries: 8, misses: 1, recent: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      ich: { tries: 8, misses: 4, recent: [1, 0, 1, 0, 1, 0, 1, 0] },
    });
    expect(weak.map((w) => w.rule)).toEqual(["ue", "ich"]);
  });

  it("builds drills that all contain the target sound at the right tier", () => {
    const easy = drillFor("ue", undefined);
    expect(easy.length).toBeGreaterThan(3);
    expect(easy.every((i) => rulesInText(i.de).includes("ue"))).toBe(true);
    expect(easy[0].tier).toBe(1);
    const hard = drillFor("ue", { tries: 10, misses: 0, recent: Array(10).fill(1) });
    expect(hard[0].tier).toBeGreaterThan(1);
  });

  it("covers many sounds in the diagnostic", () => {
    const set = diagnosticSet(8);
    const covered = new Set(set.flatMap((i) => rulesInText(i.de)));
    expect(set.length).toBe(8);
    expect(covered.size).toBeGreaterThanOrEqual(12);
  });
});

describe("tutor client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("picks the newest stable flash model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash-preview", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash-image", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding", supportedGenerationMethods: ["embedContent"] },
      ],
    }))));
    expect((await listFlashModels("k"))[0]).toBe("gemini-3.8-flash");
  });

  it("reports rate limits clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })));
    await expect(listFlashModels("k")).rejects.toMatchObject({ kind: "rate" });
  });

  it("parses a structured reply and sends history in order", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: "Hallo!", translation: "Hello!", corrections: [{ you_said: "Ich bin gut", better: "Mir geht es gut", why: "x" }], new_words: [], suggestion: "Danke!" }) }] } }],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const r = await tutorTurn("k", "gemini-3.8-flash", "sys", [{ id: "1", role: "tutor", text: "Hi", at: 0 }], "Ich bin gut");
    expect(r.reply).toBe("Hallo!");
    expect(r.corrections[0].better).toBe("Mir geht es gut");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["model", "user"]);
  });

  it("puts level, situation and weak sounds into the instructions", () => {
    const p = systemPrompt({ level: "A1", scenario: SCENARIOS[1], name: "Sam", weakSounds: ["ü"] });
    expect(p).toContain("A1");
    expect(p).toContain("café");
    expect(p).toContain("ü");
    expect(p).toContain("Sam");
  });
});
