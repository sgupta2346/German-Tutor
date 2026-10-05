import { useEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "./store";
import { browserVoiceGender, speakerGender, type SpeakerGender } from "./speaker";

const DEFAULT_AUDIO_BASE = "https://huggingface.co/datasets/Sgupta02/german-tutor-audio/resolve/main";
const AUDIO_BASE = ((import.meta.env.VITE_AUDIO_BASE as string | undefined) || DEFAULT_AUDIO_BASE).replace(/\/$/, "");

type Entry = [string, Record<string, [number, number]>];
let manifest: { voices: string[]; files: Record<string, Entry> } | null = null;
const PACK_CACHE = "klang-audio-v3";
export const VOICE_GENDER: Record<string, SpeakerGender> = { thorsten: "male" };
const RELIABLE_VOICES = Object.keys(VOICE_GENDER);
const packs = new Map<string, Promise<ArrayBuffer>>();
let manifestPromise: Promise<void> | null = null;
let current: { text: string; slow: boolean; stop: () => void } | null = null;
let lastError: string | null = null;
let manifestFailed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function normalizeKey(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function loadManifest(): Promise<void> {
  manifestPromise ??= import("@content/audio_manifest.json")
    .then((mod) => {
      const m = mod.default as unknown as { voices?: string[]; files?: Record<string, Entry> };
      manifest = m?.files ? { voices: (m.voices ?? []).filter((v) => RELIABLE_VOICES.includes(v)), files: m.files } : { voices: [], files: {} };
      manifestFailed = !m?.files;
      emit();
    })
    .catch(() => {
      manifest = { voices: [], files: {} };
      manifestFailed = true;
      manifestPromise = null;
    });
  return manifestPromise;
}

function packUrl(name: string): string {
  return `${AUDIO_BASE}/packs/${name}.bin`;
}

async function fetchPack(name: string): Promise<ArrayBuffer> {
  const url = packUrl(name);
  let cache: Cache | null = null;
  try {
    cache = await caches.open(PACK_CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pack ${name} failed`);
  if (cache) {
    try {
      await cache.put(url, res.clone());
    } catch {
      cache = null;
    }
  }
  return res.arrayBuffer();
}

function getPack(name: string): Promise<ArrayBuffer> {
  let p = packs.get(name);
  if (!p) {
    p = fetchPack(name).catch((e) => {
      packs.delete(name);
      throw e;
    });
    packs.set(name, p);
  }
  return p;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export function forgetOldAudioCaches(): void {
  caches
    ?.keys()
    .then((keys) => keys.filter((k) => k.startsWith("klang-audio-") && k !== PACK_CACHE).forEach((k) => caches.delete(k)))
    .catch(() => undefined);
}

export async function preloadAudio(levels: string[] = ["core", "a1"]): Promise<void> {
  await loadManifest();
  const voice = useStore.getState().settings.voice;
  const v = manifest?.voices.includes(voice) ? voice : manifest?.voices[0];
  if (!v || voice === "browser") return;
  await Promise.all(levels.map((level) => getPack(`${v}-${level}`).catch(() => undefined)));
}

export function germanVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("de"));
}

const PREFERRED = ["Google Deutsch", "Microsoft Katja", "Microsoft Conrad", "Anna", "Petra", "Markus", "Microsoft Seraphina", "Microsoft Florian"];

const naturalFirst = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) => Number(/natural|online|neural/i.test(b.name)) - Number(/natural|online|neural/i.test(a.name));

export function browserVoicesFor(gender: SpeakerGender): SpeechSynthesisVoice[] {
  return germanVoices()
    .filter((v) => browserVoiceGender(v.name) === gender)
    .sort(naturalFirst);
}

function pickVoice(uri: string | null, gender: SpeakerGender | null = null): SpeechSynthesisVoice | undefined {
  const voices = germanVoices();
  if (gender) {
    const preferred = gender === "female" ? useStore.getState().settings.femaleVoiceURI : null;
    const candidates = browserVoicesFor(gender);
    const match = candidates.find((v) => v.voiceURI === preferred) ?? candidates[0];
    if (match) return match;
  }
  if (uri) {
    const chosen = voices.find((v) => v.voiceURI === uri);
    if (chosen) return chosen;
  }
  for (const name of PREFERRED) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang === "de-DE") ?? voices[0];
}

export function stop() {
  current?.stop();
  current = null;
  emit();
}

type Token = { text: string; slow: boolean; stop: () => void };

function playFile(url: string, rate: number, token: Token): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = new Audio(url);
    el.playbackRate = rate;
    el.preservesPitch = true;
    let started = false;
    let guard = window.setTimeout(() => {
      if (!started) {
        el.pause();
        reject(new Error("audio took too long to start"));
      }
    }, 7000);
    const finish = () => {
      window.clearTimeout(guard);
      resolve();
    };
    token.stop = () => {
      el.pause();
      finish();
    };
    el.onplaying = () => {
      started = true;
      window.clearTimeout(guard);
      const seconds = Number.isFinite(el.duration) ? el.duration / rate : 30;
      guard = window.setTimeout(finish, (seconds + 2) * 1000);
    };
    el.onended = finish;
    el.onerror = () => {
      window.clearTimeout(guard);
      reject(new Error("audio failed"));
    };
    el.play().catch((e) => {
      window.clearTimeout(guard);
      reject(e);
    });
  });
}

const liveUtterances = new Set<SpeechSynthesisUtterance>();

function playSynth(text: string, rate: number, voiceURI: string | null, token: Token, gender: SpeakerGender | null = null): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve(false);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = rate;
    const voice = pickVoice(voiceURI, gender);
    if (voice) u.voice = voice;
    liveUtterances.add(u);
    let started = false;
    const done = (ok: boolean) => {
      window.clearTimeout(startGuard);
      window.clearTimeout(endGuard);
      liveUtterances.delete(u);
      resolve(ok);
    };
    const startGuard = window.setTimeout(() => {
      if (!started) {
        speechSynthesis.cancel();
        done(false);
      }
    }, 2500);
    const endGuard = window.setTimeout(() => {
      speechSynthesis.cancel();
      done(started);
    }, 4000 + (text.length * 90) / rate);
    u.onstart = () => {
      started = true;
    };
    u.onend = () => done(true);
    u.onerror = () => done(started);
    token.stop = () => {
      speechSynthesis.cancel();
      done(true);
    };
    speechSynthesis.speak(u);
    if (speechSynthesis.paused) speechSynthesis.resume();
  });
}

export async function speak(text: string, opts: { slow?: boolean; rate?: number; voice?: string; gender?: SpeakerGender } = {}): Promise<void> {
  const settings = useStore.getState().settings;
  const voiceURI = settings.voiceURI;
  const gender = opts.voice ? null : opts.gender ?? speakerGender(text);
  const voice = opts.voice ?? settings.voice;
  const rate = opts.rate ?? settings.rate;
  const slow = !!opts.slow;
  const finalRate = slow ? Math.max(0.5, rate * 0.65) : rate;
  if (current && current.text === text && current.slow === slow) {
    stop();
    return;
  }
  stop();
  const token: Token = { text, slow, stop: () => {} };
  current = token;
  emit();
  try {
    await loadManifest();
    if (current !== token) return;
    const file = manifest?.files[normalizeKey(text)];
    let played = false;
    const recordedForGender = gender && file ? RELIABLE_VOICES.find((r) => VOICE_GENDER[r] === gender && file[1][r]) : undefined;
    const useBrowserForGender = !!gender && !recordedForGender && browserVoicesFor(gender).length > 0;
    if (file && voice !== "browser" && !useBrowserForGender) {
      const [pack, offsets] = file;
      const byGender = recordedForGender;
      const v = byGender ?? (RELIABLE_VOICES.includes(voice) && offsets[voice] ? voice : RELIABLE_VOICES.find((r) => offsets[r]) ?? Object.keys(offsets)[0]);
      const buffer = await withTimeout(getPack(`${v}-${pack}`), 2500).catch(() => null);
      if (buffer && current === token) {
        const [offset, length] = offsets[v];
        const url = URL.createObjectURL(new Blob([buffer.slice(offset, offset + length)], { type: "audio/mpeg" }));
        played = await playFile(url, finalRate, token).then(
          () => true,
          () => false,
        );
        URL.revokeObjectURL(url);
      }
    }
    if (!played && current === token) played = await playSynth(text, finalRate, voiceURI, token, gender);
    if (!played && current === token) {
      lastError = file || manifestFailed
        ? "Couldn't play audio. The recordings didn't load and the browser voice didn't speak. If you use Brave, turn Shields off for this site, or try Chrome or Edge."
        : "Your browser has no German voice for this phrase. Try Chrome or Edge, or install a German voice in Windows speech settings.";
      emit();
    } else if (played && lastError) {
      lastError = null;
      emit();
    }
  } finally {
    if (current === token) {
      current = null;
      emit();
    }
  }
}

export function dismissAudioError() {
  lastError = null;
  emit();
}

export function useAudioError(): string | null {
  return useSyncExternalStore(subscribe, () => lastError);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSpeaking(text?: string, slow?: boolean): boolean {
  const playing = useSyncExternalStore(subscribe, () => (current ? `${current.slow ? "1" : "0"}${current.text}` : null));
  if (playing === null) return false;
  if (text === undefined) return true;
  if (playing.slice(1) !== text) return false;
  return slow === undefined || playing[0] === (slow ? "1" : "0");
}

export function useGermanVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(germanVoices);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const update = () => setVoices(germanVoices());
    speechSynthesis.addEventListener("voiceschanged", update);
    update();
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}

export function useNaturalVoices(): string[] {
  const [voices, setVoices] = useState<string[]>(manifest?.voices ?? []);
  useEffect(() => {
    loadManifest().then(() => setVoices(manifest?.voices ?? []));
  }, []);
  return voices;
}
