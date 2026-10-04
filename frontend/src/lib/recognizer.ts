import { create } from "zustand";

export const MODEL_DTYPE: "q4" | "fp16" | "fp32" = "q4";
export const MODEL_SIZE_MB = { q4: 241, fp16: 632, fp32: 1264 }[MODEL_DTYPE];

type Status = "idle" | "loading" | "ready" | "error";

interface RecognizerState {
  status: Status;
  progress: number;
  device: string | null;
  error: string | null;
}

export const useRecognizer = create<RecognizerState>(() => ({ status: "idle", progress: 0, device: null, error: null }));

type Pending = { resolve: (v: { phones?: string[]; ms?: number }) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let loadPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/phoneme.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "progress") {
      if (msg.total) useRecognizer.setState({ progress: msg.loaded / msg.total });
      return;
    }
    if (msg.type === "ready") {
      useRecognizer.setState({ device: msg.device });
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === "error") p.reject(new Error(msg.message));
    else p.resolve(msg);
  };
  worker.onerror = (e) => {
    useRecognizer.setState({ status: "error", error: e.message || "The pronunciation model crashed" });
    for (const p of pending.values()) p.reject(new Error("worker error"));
    pending.clear();
    worker = null;
    loadPromise = null;
  };
  return worker;
}

function call(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<{ phones?: string[]; ms?: number }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id }, transfer);
  });
}

export function loadRecognizer(): Promise<void> {
  if (loadPromise) return loadPromise;
  useRecognizer.setState({ status: "loading", error: null });
  loadPromise = call({ type: "load", dtype: MODEL_DTYPE })
    .then(() => {
      useRecognizer.setState({ status: "ready", progress: 1 });
    })
    .catch((e: Error) => {
      loadPromise = null;
      useRecognizer.setState({ status: "error", error: e.message });
      throw e;
    });
  return loadPromise;
}

export async function recognizePhones(audio: Float32Array): Promise<{ phones: string[]; ms: number }> {
  await loadRecognizer();
  const copy = audio.slice();
  const res = await call({ type: "recognize", audio: copy }, [copy.buffer]);
  return { phones: res.phones ?? [], ms: res.ms ?? 0 };
}
