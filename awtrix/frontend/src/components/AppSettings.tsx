import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Field {
  key: string;
  path?: string[];
  label?: string;
  type: string;
  value: unknown;
  default?: unknown;
  options?: string[];
  nullable?: boolean;
  min?: number;
  max?: number;
  maxlen?: number;
  help?: string;
}

interface Config {
  fields: Field[];
  warnings?: string[];
}

const inputClass = "rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-sm";

function format(field: Field): string {
  const value = field.value === undefined ? field.default : field.value;
  if (value === undefined || value === null) return "";
  if (field.type === "color" && typeof value === "number") {
    return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function parse(field: Field, text: string): unknown {
  if (field.nullable && text === "") return null;
  switch (field.type) {
    case "bool": return text === "true";
    case "number": {
      const value = Number(text);
      if (!text.trim() || !Number.isFinite(value)) throw new Error(`${field.label || field.key} needs a number`);
      return value;
    }
    case "text":
    case "color":
    case "select": return text;
    default: return JSON.parse(text);
  }
}

function setAtPath(output: Record<string, unknown>, path: string[], value: unknown) {
  for (const key of path.slice(0, -1)) {
    if (!(key in output)) output[key] = Object.create(null);
    output = output[key] as Record<string, unknown>;
  }
  output[path[path.length - 1]] = value;
}

export default function AppSettings({ host, name, builtin }: { host: string; name: string; builtin: boolean }) {
  const path = `/management/${encodeURIComponent(host)}/apps/${builtin ? "builtin/" : ""}${encodeURIComponent(name)}/config`;
  const [config, setConfig] = useState<Config | null>(null);
  const [changed, setChanged] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Config>(path, { signal: controller.signal }).then(setConfig, (err) => {
      if (!controller.signal.aborted) setError(String(err));
    });
    return () => controller.abort();
  }, [path]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const patch: Record<string, unknown> = Object.create(null);
      for (const field of config.fields) {
        if (!Object.hasOwn(changed, field.key)) continue;
        setAtPath(patch, field.path?.length ? field.path : [field.key], parse(field, changed[field.key]));
      }
      const result = await api<{ error?: unknown }>(path, { method: "PATCH", body: JSON.stringify(patch) });
      setNotice(result.error ? `Saved. The app reported an error: ${JSON.stringify(result.error)}` : "App settings saved.");
      setChanged({});
      setConfig(await api<Config>(path));
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">App settings</h3>
      {config ? (
        config.fields.length ? (
          <div className="space-y-3">
            {config.fields.map((field) => {
              const value = Object.hasOwn(changed, field.key) ? changed[field.key] : format(field);
              const change = (text: string) => setChanged((previous) => ({ ...previous, [field.key]: text }));
              return (
                <label key={field.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{field.label || field.key}{field.help && <small className="block opacity-70">{field.help}</small>}</span>
                  {field.type === "bool" || field.type === "select" ? (
                    <select className={inputClass} value={value} onChange={(e) => change(e.target.value)}>
                      {field.nullable && <option value="">Default</option>}
                      {(field.type === "bool" ? ["true", "false"] : field.options || []).map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input className={inputClass} type={field.type === "number" ? "number" : "text"}
                      value={value} placeholder={field.nullable ? "Default" : undefined}
                      min={field.min} max={field.max} maxLength={field.maxlen}
                      onChange={(e) => change(e.target.value)} />
                  )}
                </label>
              );
            })}
            <button type="button" className={inputClass} disabled={saving || !Object.keys(changed).length} onClick={save}>
              Save app settings
            </button>
          </div>
        ) : <p className="text-sm opacity-70">This app has no settings.</p>
      ) : !error && <p className="text-sm opacity-70">Loading app settings…</p>}
      {config?.warnings?.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-400">{warning}</p>)}
      {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}

export function AppData({ host, name }: { host: string; name: string }) {
  const path = `/management/${encodeURIComponent(host)}/apps/${encodeURIComponent(name)}/data`;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [patch, setPatch] = useState("{}");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setStatus("");
    try {
      setData(await api<Record<string, unknown>>(path));
    } catch (err) {
      setStatus(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const value: unknown = JSON.parse(patch);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter a JSON object.");
      const result = await api<{ error?: unknown }>(path, { method: "PATCH", body: JSON.stringify(value) });
      setData(await api<Record<string, unknown>>(path));
      setPatch("{}");
      setStatus(result.error ? `Saved. The app reported an error: ${JSON.stringify(result.error)}` : "App data saved.");
    } catch (err) {
      setStatus(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Stored app data</h3>
        <button type="button" className={inputClass} onClick={load} disabled={busy}>{data ? "Refresh" : "Load"}</button>
      </div>
      {data && (
        <div className="space-y-2">
          <pre className="max-h-40 overflow-auto rounded bg-black/30 p-2 text-xs">{JSON.stringify(data, null, 2)}</pre>
          <label className="block text-sm">JSON changes. Set a key to <code>null</code> to remove it.
            <textarea className={`${inputClass} mt-1 block w-full font-mono`} rows={3} value={patch} onChange={(e) => setPatch(e.target.value)} />
          </label>
          <button type="button" className={inputClass} onClick={save} disabled={busy || patch.trim() === "{}"}>Apply app data changes</button>
        </div>
      )}
      {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    </section>
  );
}
