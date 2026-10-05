import { useRef, useState } from "react";
import clsx from "clsx";
import { Download, Monitor, Moon, Sun, Trash2, Upload } from "lucide-react";
import { speak, useGermanVoices, useNaturalVoices } from "@/lib/audio";
import { browserRecognitionAvailable } from "@/lib/scorer";
import { loadRecognizer, MODEL_SIZE_MB, useRecognizer } from "@/lib/recognizer";
import { useStore, type Theme } from "@/lib/store";
import { PageHeader } from "@/components/ui";

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{title}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { settings, updateSettings, name, setName, reset, importState } = useStore();
  const voices = useGermanVoices();
  const natural = useNaturalVoices();
  const model = useRecognizer();
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  function exportProgress() {
    const raw = localStorage.getItem("klang-progress") ?? "{}";
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `klang-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importProgress(f: File) {
    try {
      const ok = importState(JSON.parse(await f.text()));
      setMessage(ok ? "Progress imported." : "That file doesn't look like a Klang backup.");
    } catch {
      setMessage("Couldn't read that file.");
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Preferences" title="Settings" />

      <div className="card divide-y divide-line px-6">
        <Row title="Your name" hint="Used for greetings.">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-56 rounded-xl border-2 border-line bg-bg px-3 py-2 outline-none focus:border-ink" />
        </Row>
        <Row title="Theme">
          <div className="inline-flex rounded-full bg-raised p-1">
            {([
              ["light", Sun],
              ["system", Monitor],
              ["dark", Moon],
            ] as [Theme, typeof Sun][]).map(([t, Icon]) => (
              <button
                key={t}
                aria-label={t}
                onClick={() => updateSettings({ theme: t })}
                className={clsx("rounded-full p-2.5", settings.theme === t ? "bg-ink text-bg" : "text-muted")}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </Row>
        <Row title="Daily goal" hint="XP you aim for each day.">
          <div className="flex gap-2">
            {[20, 50, 100, 150].map((g) => (
              <button key={g} onClick={() => updateSettings({ dailyGoal: g })} className={clsx("chip !px-3 !py-1.5 !text-sm", settings.dailyGoal === g && "!bg-ink !text-bg")}>
                {g}
              </button>
            ))}
          </div>
        </Row>
        <Row title="New cards per day" hint="How many unseen words enter your reviews daily.">
          <input
            type="range"
            min={0}
            max={40}
            step={5}
            value={settings.newPerDay}
            onChange={(e) => updateSettings({ newPerDay: Number(e.target.value) })}
            className="w-44 accent-[var(--color-gold)]"
          />
          <span className="ml-3 font-bold">{settings.newPerDay}</span>
        </Row>
        <Row title="Speech speed">
          <input
            type="range"
            min={0.6}
            max={1.2}
            step={0.05}
            value={settings.rate}
            onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
            onMouseUp={() => speak("Wie schnell soll ich sprechen?")}
            onTouchEnd={() => speak("Wie schnell soll ich sprechen?")}
            className="w-44 accent-[var(--color-gold)]"
          />
          <span className="ml-3 font-bold">{settings.rate.toFixed(2)}×</span>
        </Row>
        <Row title="Voice" hint={natural.length ? "Natural recorded voices, or any German voice your browser has." : "German voices installed in your browser."}>
          <select
            value={settings.voice === "browser" ? `browser:${settings.voiceURI ?? ""}` : settings.voice}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("browser:")) updateSettings({ voice: "browser", voiceURI: v.slice(8) || null });
              else updateSettings({ voice: v });
              setTimeout(() => speak("Hallo, so klinge ich."), 50);
            }}
            className="w-64 rounded-xl border-2 border-line bg-bg px-3 py-2"
          >
            {natural.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)} (natural)
              </option>
            ))}
            <option value="browser:">Browser voice, automatic</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={`browser:${v.voiceURI}`}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Row>
        <Row title="Autoplay audio" hint="Play new words and phrases as soon as they appear.">
          <button
            role="switch"
            aria-checked={settings.autoplay}
            onClick={() => updateSettings({ autoplay: !settings.autoplay })}
            className={clsx("relative h-8 w-14 rounded-full transition-colors", settings.autoplay ? "bg-good" : "bg-line")}
          >
            <span className={clsx("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", settings.autoplay ? "left-7" : "left-1")} />
          </button>
        </Row>
        <Row
          title="Pronunciation model"
          hint={`Runs on your device, recordings never leave it. One-time download of about ${MODEL_SIZE_MB} MB.${browserRecognitionAvailable ? "" : " Word recognition needs Chrome or Edge."}`}
        >
          {model.status === "ready" ? (
            <span className="chip !bg-good/15 !text-sm !text-good">Ready{model.device ? ` · ${model.device === "webgpu" ? "GPU" : "CPU"}` : ""}</span>
          ) : model.status === "loading" ? (
            <span className="chip !text-sm">Downloading {Math.round(model.progress * 100)}%</span>
          ) : (
            <button className="btn btn-ghost text-sm" onClick={() => loadRecognizer().catch(() => {})}>
              <Download size={15} /> {model.status === "error" ? "Retry download" : "Download now"}
            </button>
          )}
        </Row>
        <Row title="Your progress" hint="Everything is stored in this browser. Export a backup to move it to another device.">
          <div className="flex gap-2">
            <button className="btn btn-ghost text-sm" onClick={exportProgress}>
              <Download size={15} /> Export
            </button>
            <button className="btn btn-ghost text-sm" onClick={() => file.current?.click()}>
              <Upload size={15} /> Import
            </button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importProgress(e.target.files[0])} />
          </div>
        </Row>
        <Row title="Reset everything" hint="Deletes all progress in this browser.">
          <button
            className="btn btn-ghost text-sm !text-bad"
            onClick={() => {
              if (confirm("Delete all your progress? This can't be undone.")) reset();
            }}
          >
            <Trash2 size={15} /> Reset
          </button>
        </Row>
      </div>
      {message && <p className="mt-4 text-sm text-muted">{message}</p>}
    </div>
  );
}
