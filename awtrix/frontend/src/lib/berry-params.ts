export interface ScriptParam {
  key: string;
  type: "bool" | "text" | "number" | "slider" | "select" | "color";
  label: string;
  default?: string | number | boolean;
  help?: string;
  unit?: string;
  group?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  maxlen?: number;
  hint?: string;
}

export interface ScriptSecret {
  key: string;
  label: string;
  hosts?: string;
}

export interface ScriptMeta {
  name?: string;
  desc?: string;
  author?: string;
  version?: string;
  headless?: boolean;
  ondemand?: boolean;
  icons?: string[];
  display?: { width: number; height: number };
  requires?: string[];
  needs?: string[];
}

const PARAM_TYPES = new Set(["bool", "text", "number", "slider", "select", "color"]);

function parseOpts(raw: string): Record<string, string> {
  const opts: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([\S]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    opts[m[1]] = m[2] ?? m[3];
  }
  return opts;
}

export function parseScriptParams(source: string): ScriptParam[] {
  const params: ScriptParam[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#")) continue;
    const m = trimmed.match(
      /^#\s*@config\s+(\w+)\s+(\w+)\s+"([^"]+)"(.*)$/
    );
    if (!m) continue;
    const [, key, rawType, label, rest] = m;
    const type = rawType as ScriptParam["type"];
    if (!PARAM_TYPES.has(type)) continue;

    const opts = parseOpts(rest);
    const param: ScriptParam = { key, type, label };

    if (opts.default !== undefined) {
      if (type === "bool") param.default = opts.default === "true";
      else if (type === "number" || type === "slider") param.default = Number(opts.default);
      else param.default = opts.default;
    }
    if (opts.help) param.help = opts.help;
    if (opts.unit) param.unit = opts.unit;
    if (opts.group) param.group = opts.group;
    if (opts.hint) param.hint = opts.hint;
    if (opts.options) param.options = opts.options.split(",").map((s) => s.trim());
    if (opts.min !== undefined) param.min = Number(opts.min);
    if (opts.max !== undefined) param.max = Number(opts.max);
    if (opts.step !== undefined) param.step = Number(opts.step);
    if (opts.maxlen !== undefined) param.maxlen = Number(opts.maxlen);

    params.push(param);
  }
  return params;
}

export function parseScriptSecrets(source: string): ScriptSecret[] {
  const secrets: ScriptSecret[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^#\s*@secret\s+(\w+)(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    const opts = parseOpts(rest);
    secrets.push({
      key,
      label: opts.label || key,
      hosts: opts.hosts,
    });
  }
  return secrets;
}

export function parseScriptMeta(source: string): ScriptMeta {
  const meta: ScriptMeta = {};
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#")) {
      if (trimmed.length > 0) break;
      continue;
    }
    const simple = trimmed.match(/^#\s*@(\w+)\s+(.+)$/);
    if (!simple) continue;
    const [, tag, value] = simple;
    switch (tag) {
      case "name": meta.name = value.trim(); break;
      case "desc": meta.desc = value.trim(); break;
      case "author": meta.author = value.trim(); break;
      case "version": meta.version = value.trim(); break;
      case "headless": meta.headless = value.trim() === "true"; break;
      case "ondemand": meta.ondemand = true; break;
      case "icons": meta.icons = value.split(/\s+/).filter(Boolean); break;
      case "display": {
        const dims = value.trim().split(/\s+/).map(Number);
        if (dims.length >= 2) meta.display = { width: dims[0], height: dims[1] };
        break;
      }
      case "requires": meta.requires = [...(meta.requires || []), value.trim()]; break;
      case "needs": meta.needs = [...(meta.needs || []), value.trim()]; break;
    }
  }
  return meta;
}
