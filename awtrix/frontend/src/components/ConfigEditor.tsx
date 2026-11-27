import { useState } from "react";
import { Save, Settings, ChevronDown, ChevronRight, KeyRound } from "lucide-react";
import type { ScriptParam, ScriptSecret } from "@/lib/berry-params";

interface Props {
  params: ScriptParam[];
  secrets: ScriptSecret[];
  values: Record<string, unknown>;
  saving: boolean;
  onSave: (values: Record<string, unknown>) => void;
}

function intToHex(val: unknown): string {
  if (typeof val === "string") return val.startsWith("#") ? val : `#${val}`;
  if (typeof val === "number") return `#${(val & 0xffffff).toString(16).padStart(6, "0")}`;
  return "#ffffff";
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function resolveValue(param: ScriptParam, raw: unknown): unknown {
  if (raw !== undefined && raw !== null) return raw;
  return param.default;
}

export default function ConfigEditor({ params, secrets, values, saving, onSave }: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const p of params) {
      init[p.key] = resolveValue(p, values[p.key]);
    }
    return init;
  });
  const [expanded, setExpanded] = useState(true);

  function update(key: string, val: unknown) {
    setLocal((prev) => ({ ...prev, [key]: val }));
  }

  const hasChanges = params.some((p) => {
    const cur = local[p.key];
    const orig = resolveValue(p, values[p.key]);
    return cur !== orig;
  });

  const groups = new Map<string, ScriptParam[]>();
  for (const p of params) {
    const g = p.group || "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  if (params.length === 0 && secrets.length === 0) return null;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold transition-colors hover:bg-[hsl(var(--accent))]/30"
      >
        <span className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          Configuration
          <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
            {params.length} parameter{params.length !== 1 ? "s" : ""}
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[hsl(var(--border))] px-4 py-4 space-y-5">
          {[...groups.entries()].map(([groupName, groupParams]) => (
            <div key={groupName}>
              {groupName && (
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  {groupName}
                </h4>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {groupParams.map((p) => (
                  <ParamField
                    key={p.key}
                    param={p}
                    value={local[p.key]}
                    onChange={(v) => update(p.key, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {secrets.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" />
                Secrets
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {secrets.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2">
                    <label className="text-sm text-[hsl(var(--muted-foreground))]">{s.label}</label>
                    <span className="rounded bg-[hsl(var(--accent))] px-2 py-0.5 text-xs font-mono text-[hsl(var(--muted-foreground))]">
                      {s.hosts ? `→ ${s.hosts}` : "configured on device"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {params.length > 0 && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => onSave(local)}
                disabled={saving || !hasChanges}
                className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-4 py-1.5 text-sm text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ScriptParam;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const wide = param.type === "text" && (param.maxlen ?? 0) > 32;

  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium">{param.label}</label>
        {param.unit && (
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{param.unit}</span>
        )}
      </div>

      {param.type === "bool" && (
        <button
          onClick={() => onChange(!value)}
          className={`w-fit rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
            value ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {value ? "ON" : "OFF"}
        </button>
      )}

      {param.type === "text" && (
        <input
          type="text"
          value={String(value ?? "")}
          maxLength={param.maxlen}
          placeholder={param.hint}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-[hsl(var(--input))] bg-transparent px-2.5 py-1.5 text-sm font-mono"
        />
      )}

      {param.type === "number" && (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          min={param.min}
          max={param.max}
          step={param.step}
          placeholder={param.hint}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 rounded-md border border-[hsl(var(--input))] bg-transparent px-2.5 py-1.5 text-sm font-mono text-right"
        />
      )}

      {param.type === "slider" && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={typeof value === "number" ? value : param.min ?? 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-right text-xs font-mono tabular-nums text-[hsl(var(--muted-foreground))]">
            {typeof value === "number" ? value : param.min ?? 0}
          </span>
        </div>
      )}

      {param.type === "select" && param.options && (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-[hsl(var(--input))] bg-transparent px-2.5 py-1.5 text-sm"
        >
          {param.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {param.type === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={intToHex(value)}
            onChange={(e) => onChange(hexToInt(e.target.value))}
            className="h-8 w-8 cursor-pointer rounded border border-[hsl(var(--input))] bg-transparent p-0"
          />
          <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">
            {intToHex(value)}
          </span>
        </div>
      )}

      {param.help && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{param.help}</p>
      )}
    </div>
  );
}
