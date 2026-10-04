import { useEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "./store";

const DEFAULT_AUDIO_BASE = "https://huggingface.co/datasets/Sgupta02/german-tutor-audio/resolve/main";
const AUDIO_BASE = ((import.meta.env.VITE_AUDIO_BASE as string | undefined) || DEFAULT_AUDIO_BASE).replace(/\/$/, "");

let manifest: { voices: string[]; files: Record<string, string> } | null = null;
let manifestPromise: Promise<void> | null = null;
let current: { text: string; stop: () => void } | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function normalizeKey(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function loadManifest(): Promise<void> {
  if (!AUDIO_BASE) return Promise.resolve();
  manifestPromise ??= fetch(`${AUDIO_BASE}/manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { voices?: string[]; files?: Record<string, string> } | null) => {
      manifest = m?.files ? { voices: m.voices ?? [], files: m.files } : { voices: [], files: {} };
      emit();
    })
    .catch(() => {
      manifest = { voices: [], files: {} };
    });
  return manifestPromise;
}

export function germanVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("de"));
}

const PREFERRED = ["Google Deutsch", "Microsoft Katja", "Microsoft Conrad", "Anna", "Petra", "Markus", "Microsoft Seraphina", "Microsoft Florian"];

function pickVoice(uri: string | null): SpeechSynthesisVoice | undefined {
  const voices = germanVoices();
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

type Token = { text: string; stop: () => void };

function playFile(url: string, rate: number, token: Token): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = new Audio(url);
    el.playbackRate = rate;
    el.preservesPitch = true;
    token.stop = () => {
      el.pause();
      resolve();
    };
    el.onended = () => resolve();
    el.onerror = () => reject(new Error("audio failed"));
    el.play().catch(reject);
  });
}

function playSynth(text: string, rate: number, voiceURI: string | null, token: Token): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = rate;
    const voice = pickVoice(voiceURI);
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    token.stop = () => {
      speechSynthesis.cancel();
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

export async function speak(text: string, opts: { slow?: boolean; rate?: number; voice?: string } = {}): Promise<void> {
  const settings = useStore.getState().settings;
  const voiceURI = settings.voiceURI;
  const voice = opts.voice ?? settings.voice;
  const rate = opts.rate ?? settings.rate;
  const finalRate = opts.slow ? Math.max(0.5, rate * 0.65) : rate;
  stop();
  const token: Token = { text, stop: () => {} };
  current = token;
  emit();
  try {
    await loadManifest();
    if (current !== token) return;
    const file = manifest?.files[normalizeKey(text)];
    const folder = manifest?.voices.includes(voice) ? voice : manifest?.voices[0];
    let played = false;
    if (file && folder && voice !== "browser" && AUDIO_BASE) {
      played = await playFile(`${AUDIO_BASE}/${folder}/${file}.mp3`, finalRate, token).then(
        () => true,
        () => false,
      );
    }
    if (!played && current === token) await playSynth(text, finalRate, voiceURI, token);
  } finally {
    if (current === token) {
      current = null;
      emit();
    }
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSpeaking(text?: string): boolean {
  const playing = useSyncExternalStore(subscribe, () => current?.text ?? null);
  return text === undefined ? playing !== null : playing === text;
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
