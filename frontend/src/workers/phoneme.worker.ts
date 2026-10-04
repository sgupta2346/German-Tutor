import { AutoModelForCTC, env, Tensor, type PreTrainedModel } from "@huggingface/transformers";

const MODEL = "qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX";
const SPECIAL = new Set(["<pad>", "<s>", "</s>", "<unk>", "|"]);

env.allowLocalModels = false;

type Request = { id: number; type: "load"; dtype: "q4" | "fp16" | "fp32" } | { id: number; type: "recognize"; audio: Float32Array };

let model: PreTrainedModel | null = null;
let vocab: Record<number, string> = {};
let padId = 0;
let loading: Promise<void> | null = null;

async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function load(dtype: "q4" | "fp16" | "fp32") {
  const vocabJson: Record<string, number> = await fetch(`https://huggingface.co/${MODEL}/resolve/main/vocab.json`).then((r) => r.json());
  vocab = Object.fromEntries(Object.entries(vocabJson).map(([k, v]) => [v, k]));
  padId = vocabJson["<pad>"] ?? 0;
  const webgpu = await hasWebGPU();
  const progress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === "progress" && p.file?.endsWith(".onnx")) postMessage({ type: "progress", loaded: p.loaded, total: p.total });
  };
  try {
    model = await AutoModelForCTC.from_pretrained(MODEL, { dtype, device: webgpu ? "webgpu" : "wasm", progress_callback: progress });
    postMessage({ type: "ready", device: webgpu ? "webgpu" : "wasm" });
  } catch (e) {
    if (!webgpu) throw e;
    model = await AutoModelForCTC.from_pretrained(MODEL, { dtype, device: "wasm", progress_callback: progress });
    postMessage({ type: "ready", device: "wasm" });
  }
}

function normalize(audio: Float32Array): Float32Array {
  let mean = 0;
  for (const v of audio) mean += v;
  mean /= audio.length;
  let variance = 0;
  for (const v of audio) variance += (v - mean) ** 2;
  const std = Math.sqrt(variance / audio.length + 1e-7);
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = (audio[i] - mean) / std;
  return out;
}

async function recognize(audio: Float32Array): Promise<string[]> {
  if (!model) throw new Error("Model not loaded");
  const input = new Tensor("float32", normalize(audio), [1, audio.length]);
  const { logits } = (await model({ input_values: input })) as { logits: Tensor };
  const [, frames, classes] = logits.dims as number[];
  const data = logits.data as Float32Array;
  const phones: string[] = [];
  let prev = -1;
  for (let t = 0; t < frames; t++) {
    let best = 0;
    let bestVal = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = data[t * classes + c];
      if (v > bestVal) {
        bestVal = v;
        best = c;
      }
    }
    if (best !== prev && best !== padId) {
      const tok = vocab[best];
      if (tok && !SPECIAL.has(tok)) phones.push(tok);
    }
    prev = best;
  }
  return phones;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      loading ??= load(msg.dtype);
      await loading;
      postMessage({ id: msg.id, type: "done" });
    } else {
      if (loading) await loading;
      const started = performance.now();
      const phones = await recognize(msg.audio);
      postMessage({ id: msg.id, type: "done", phones, ms: Math.round(performance.now() - started) });
    }
  } catch (err) {
    loading = null;
    postMessage({ id: msg.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
