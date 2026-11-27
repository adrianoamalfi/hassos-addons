import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Sun,
  Download,
  Upload,
  Settings,
  Code,
  HardDrive,
  RefreshCw,
  Clock,
  Cpu,
  ScrollText,
  FolderOpen,
  Wrench,
  FileUp,
  Play,
  Music,
  ExternalLink,
  Info,
  Wifi,
  Zap,
  RotateCw,
  Cog,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api, basePath } from "@/lib/api";
import { parseScriptParams, parseScriptSecrets } from "@/lib/berry-params";
import type { ScriptParam, ScriptSecret } from "@/lib/berry-params";
import DisplayPreview from "@/components/DisplayPreview";
import ScriptEditor from "@/components/ScriptEditor";
import ConfigEditor from "@/components/ConfigEditor";
import DeviceLogs from "@/components/DeviceLogs";
import { Skeleton, SettingsSkeleton, AppListSkeleton } from "@/components/Skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";

interface AppMeta {
  name?: string;
  desc?: string;
  author?: string;
  version?: string;
  icons?: string[];
  requires?: { name: string; missing: boolean }[];
  needs?: { name: string; missing: boolean }[];
  display?: { width: number; height: number; fits: boolean } | null;
}

interface AppInfo {
  name: string;
  enabled?: boolean;
  inLoop?: boolean;
  slot?: number | null;
  error?: string | null;
  origin?: string | null;
  icon?: string | null;
  config?: boolean;
  present?: boolean;
  skipped?: boolean;
  headless?: boolean;
  ondemand?: boolean;
  meta?: AppMeta | null;
}

type Tab = "apps" | "settings" | "backup" | "logs" | "files" | "advanced";

const ORIGIN_BADGE: Record<string, { label: string; color: string }> = {
  builtin: { label: "Built-in", color: "text-blue-400 bg-blue-400/10" },
  pushed: { label: "Pushed", color: "text-amber-400 bg-amber-400/10" },
  script: { label: "Script", color: "text-emerald-400 bg-emerald-400/10" },
};

type SettingType = "bool" | "slider" | "number" | "color";

interface SettingDef {
  key: string;
  label: string;
  type: SettingType;
  min?: number;
  max?: number;
  step?: number;
}

const SAFE_SETTINGS: SettingDef[] = [
  { key: "brightness", label: "Brightness", type: "slider", min: 0, max: 255 },
  { key: "autoBrightness", label: "Auto Brightness", type: "bool" },
  { key: "autoTransition", label: "Auto Transition", type: "bool" },
  { key: "appDurationMs", label: "App Duration (ms)", type: "slider", min: 1000, max: 30000, step: 500 },
  { key: "transitionDurationMs", label: "Transition (ms)", type: "slider", min: 100, max: 5000, step: 100 },
  { key: "time24h", label: "24h Format", type: "bool" },
  { key: "timeLeadingZero", label: "Leading Zero", type: "bool" },
  { key: "timeShowSeconds", label: "Show Seconds", type: "bool" },
  { key: "useCelsius", label: "Celsius", type: "bool" },
  { key: "uppercase", label: "Uppercase", type: "bool" },
  { key: "blockNavigation", label: "Block Nav", type: "bool" },
  { key: "volume", label: "Volume", type: "slider", min: 0, max: 100 },
  { key: "bootSound", label: "Boot Sound", type: "bool" },
  { key: "enlargeApps", label: "Enlarge Apps", type: "bool" },
  { key: "calendarAnimation", label: "Calendar Anim", type: "bool" },
  { key: "textColor", label: "Text Color", type: "color" },
  { key: "calendarHeaderColor", label: "Calendar Header", type: "color" },
  { key: "calendarTextColor", label: "Calendar Text", type: "color" },
  { key: "calendarBodyColor", label: "Calendar Body", type: "color" },
];

const BOARD_LABELS: Record<string, string> = {
  tc002: "Ulanzi TC002 (52×16)",
  tc001: "Ulanzi TC001 (32×8)",
};

function formatHeap(bytes: unknown, totalBytes?: unknown): { text: string; pct: number } {
  const free = Number(bytes) || 0;
  const total = Number(totalBytes) || 0;
  const freeKB = free / 1024;
  const freeMB = free / 1048576;
  const text = freeMB >= 1 ? `${freeMB.toFixed(1)} MB` : `${freeKB.toFixed(0)} KB`;
  const pct = total > 0 ? Math.round((free / total) * 100) : 0;
  return { text, pct };
}

function formatUptime(seconds: unknown): string {
  const s = Number(seconds) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

function intToHex(val: unknown): string {
  if (typeof val === "string") return val.startsWith("#") ? val : `#${val}`;
  if (typeof val === "number") return `#${val.toString(16).padStart(6, "0")}`;
  return "#ffffff";
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export default function DeviceDetail() {
  const { host } = useParams<{ host: string }>();
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<Record<string, AppInfo>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [brightness, setBrightness] = useState(50);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("apps");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [deviceInfo, setDeviceInfo] = useState<Record<string, unknown> | null>(null);
  const [backups, setBackups] = useState<{ filename: string; size: number }[]>([]);
  const [exporting, setExporting] = useState(false);
  const [files, setFiles] = useState<{ name: string; size?: number }[]>([]);
  const [filesDir, setFilesDir] = useState<"/ICONS" | "/MELODIES" | "/MP3">("/ICONS");
  const [filesLoading, setFilesLoading] = useState(false);
  const [firmware, setFirmware] = useState<Record<string, unknown> | null>(null);
  const [fwLoading, setFwLoading] = useState(false);
  const [fwInstalling, setFwInstalling] = useState(false);
  const [systemInfo, setSystemInfo] = useState<Record<string, unknown> | null>(null);
  const [backupStoragePath, setBackupStoragePath] = useState("");
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [iconDims, setIconDims] = useState<Record<string, string>>({});
  const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [scriptParams, setScriptParams] = useState<ScriptParam[]>([]);
  const [scriptSecrets, setScriptSecrets] = useState<ScriptSecret[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const brightnessTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const encodedHost = host ? encodeURIComponent(host) : "";

  useEffect(() => {
    if (!host) return;
    loadAll();
  }, [host]);

  async function loadAll() {
    setLoading(true);
    try {
      const data = await api<{
        info: Record<string, unknown>;
        apps: Record<string, AppInfo>;
        settings: Record<string, unknown>;
        screen: unknown;
      }>(`/devices/${encodedHost}/all`);
      setDeviceInfo(data.info);
      setApps(data.apps);
      setSettings(data.settings);
      if (typeof data.settings.brightness === "number")
        setBrightness(data.settings.brightness as number);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }

  async function loadApps() {
    try {
      const data = await api<Record<string, AppInfo>>(`/devices/${encodedHost}/apps`);
      setApps(data);
    } catch {
      /* offline */
    }
  }

  async function loadBackups() {
    try {
      const [list, storage] = await Promise.all([
        api<{ filename: string; size: number }[]>("/backup/list"),
        api<{ path: string }>("/backup/storage-path"),
      ]);
      const prefix = (host || "").replace(/\./g, "-").replace(/:/g, "-");
      setBackups(list.filter((b) => b.filename.startsWith(prefix)));
      setBackupStoragePath(storage.path);
    } catch {
      /* ignore */
    }
  }

  async function loadSystem() {
    if (!host) return;
    try {
      const data = await api<Record<string, unknown>>(`/management/${encodedHost}/system`);
      setSystemInfo(data);
    } catch {
      setSystemInfo(null);
    }
  }

  async function loadFiles(dir?: string) {
    const d = dir || filesDir;
    setFilesLoading(true);
    try {
      const data = await api<{ files: { name: string; size?: number }[] }>(
        `/management/${encodedHost}/files?directory=${encodeURIComponent(d)}`,
      );
      const list = Array.isArray(data) ? data : data?.files ?? [];
      setFiles(list);
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }

  async function loadFirmware() {
    setFwLoading(true);
    try {
      const data = await api<Record<string, unknown>>(`/management/${encodedHost}/firmware`);
      setFirmware(data);
    } catch {
      setFirmware(null);
    } finally {
      setFwLoading(false);
    }
  }

  async function loadSource(appKey: string) {
    const info = apps[appKey];
    const appName = info?.name || appKey;
    setSelected(appKey);
    setScriptParams([]);
    setScriptSecrets([]);
    setAppConfig({});

    if (info?.origin === "script") {
      try {
        const data = await api<{ source: string }>(`/devices/${encodedHost}/apps/${encodeURIComponent(appName)}/source`);
        setSource(data.source);
        setScriptParams(parseScriptParams(data.source));
        setScriptSecrets(parseScriptSecrets(data.source));
      } catch {
        setSource("// Could not load source");
      }
      try {
        const cfg = await api<Record<string, unknown>>(`/devices/${encodedHost}/apps/${encodeURIComponent(appName)}/config`);
        setAppConfig(cfg || {});
      } catch {
        setAppConfig({});
      }
    } else {
      setSource("");
    }
  }

  async function saveConfig(values: Record<string, unknown>) {
    if (!selected || !host) return;
    const appName = apps[selected]?.name || selected;
    setSavingConfig(true);
    try {
      await api(`/devices/${encodedHost}/apps/${encodeURIComponent(appName)}/config`, {
        method: "PATCH",
        body: JSON.stringify({ config: values }),
      });
      setAppConfig(values);
      setMessage("Configuration saved");
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSavingConfig(false);
    }
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }

  async function saveScript() {
    if (!selected || !host) return;
    const appName = apps[selected]?.name || selected;
    setSaving(true);
    setMessage("");
    try {
      await api(`/devices/${encodedHost}/apps/${encodeURIComponent(appName)}`, {
        method: "PUT",
        body: JSON.stringify({ source }),
      });
      setMessage("Deployed");
      setTimeout(() => setMessage(""), 3000);
      loadApps();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteApp(appKey: string) {
    const appName = apps[appKey]?.name || appKey;
    setConfirmAction({
      title: "Delete app",
      message: `Are you sure you want to delete "${appName}"? This cannot be undone.`,
      action: async () => {
        if (!host) return;
        try {
          await api(`/devices/${encodedHost}/apps/${encodeURIComponent(appName)}`, { method: "DELETE" });
          setApps((prev) => {
            const next = { ...prev };
            delete next[appKey];
            return next;
          });
          if (selected === appKey) {
            setSelected(null);
            setSource("");
          }
        } catch {
          /* ignore */
        }
      },
    });
  }

  async function showApp(appKey: string) {
    if (!host) return;
    const appName = apps[appKey]?.name || appKey;
    try {
      await api(`/devices/${encodedHost}/apps/${encodeURIComponent(appName)}/show`, { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  const updateBrightness = useCallback(
    (val: number) => {
      setBrightness(val);
      if (!host) return;
      clearTimeout(brightnessTimer.current);
      brightnessTimer.current = setTimeout(async () => {
        try {
          await api(`/devices/${encodedHost}/settings`, {
            method: "PATCH",
            body: JSON.stringify({ settings: { brightness: val } }),
          });
        } catch {
          /* ignore */
        }
      }, 150);
    },
    [host, encodedHost],
  );

  function updateSettingDebounced(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    clearTimeout(settingsTimers.current[key]);
    settingsTimers.current[key] = setTimeout(async () => {
      if (!host) return;
      try {
        await api(`/devices/${encodedHost}/settings`, {
          method: "PATCH",
          body: JSON.stringify({ settings: { [key]: value } }),
        });
      } catch {
        /* ignore */
      }
    }, 300);
  }

  async function updateSetting(key: string, value: unknown) {
    if (!host) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await api(`/devices/${encodedHost}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ settings: { [key]: value } }),
      });
    } catch {
      /* ignore */
    }
  }

  async function exportBackup() {
    if (!host) return;
    setExporting(true);
    try {
      const result = await api<{ filename: string; warnings?: string[] }>(`/backup/${encodedHost}/export`, {
        method: "POST",
      });
      const warningCount = result.warnings?.length ?? 0;
      setMessage(`Backup saved: ${result.filename}${warningCount ? ` (${warningCount} item(s) skipped; details are in the archive)` : ""}`);
      setTimeout(() => setMessage(""), 5000);
      loadBackups();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setExporting(false);
    }
  }

  function confirmReboot() {
    setConfirmAction({
      title: "Reboot device",
      message: "Are you sure you want to reboot this device? It will be unavailable for a few seconds.",
      action: async () => {
        if (!host) return;
        try {
          await api(`/devices/${encodedHost}/reboot`, { method: "POST" });
          setMessage("Rebooting...");
          setTimeout(() => setMessage(""), 5000);
        } catch {
          /* ignore */
        }
      },
    });
  }

  const appList = Object.entries(apps).sort(
    ([, a], [, b]) => (a.slot ?? 999) - (b.slot ?? 999),
  );

  function categorizeApps(list: [string, AppInfo][]) {
    const rotation: [string, AppInfo][] = [];
    const ondemand: [string, AppInfo][] = [];
    const services: [string, AppInfo][] = [];
    const disabled: [string, AppInfo][] = [];

    for (const entry of list) {
      const info = entry[1];
      if (info.headless) {
        services.push(entry);
      } else if (info.ondemand && !info.inLoop) {
        ondemand.push(entry);
      } else if (info.inLoop) {
        rotation.push(entry);
      } else {
        disabled.push(entry);
      }
    }
    return { rotation, ondemand, services, disabled };
  }

  const selectedInfo = selected ? apps[selected] : null;
  const selectedName = selectedInfo?.name || selected;
  const isEditable = selectedInfo?.origin === "script";

  function switchTab(t: Tab) {
    setTab(t);
    if (t === "backup") loadBackups();
    if (t === "files") loadFiles();
    if (t === "advanced") {
      loadFirmware();
      loadSystem();
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{deviceInfo ? String(deviceInfo.hostname || host) : host}</h1>
            {loading && !deviceInfo && (
              <div className="mt-1 flex gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
            )}
            {deviceInfo && (
              <div className="mt-1 flex gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  FW {String(deviceInfo.version || "?")}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {deviceInfo.freeHeapBytes
                    ? `${formatHeap(deviceInfo.freeHeapBytes).text} free`
                    : "?"} RAM
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {deviceInfo.uptimeSeconds != null ? formatUptime(deviceInfo.uptimeSeconds) : "?"}
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={confirmReboot}
          className="flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reboot
        </button>
      </div>

      {/* Display + brightness */}
      <div className="mb-6 flex flex-wrap items-start gap-6">
        {host && <DisplayPreview host={host} pollMs={1500} />}
        <div className="flex items-center gap-3">
          <Sun className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            type="range"
            min={0}
            max={255}
            value={brightness}
            onChange={(e) => updateBrightness(Number(e.target.value))}
            className="w-40"
          />
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            {brightness}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[hsl(var(--border))]">
        {(
          [
            { id: "apps" as Tab, label: "Apps", icon: Code },
            { id: "settings" as Tab, label: "Settings", icon: Settings },
            { id: "backup" as Tab, label: "Backup", icon: Download },
            { id: "files" as Tab, label: "Files", icon: FolderOpen },
            { id: "logs" as Tab, label: "Logs", icon: ScrollText },
            { id: "advanced" as Tab, label: "Advanced", icon: Wrench },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.id
                ? "border-[hsl(var(--primary))] text-[hsl(var(--foreground))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p
          className={`mb-4 text-sm ${
            message.includes("Deployed") || message.includes("Backup") || message.includes("Rebooting") || message.includes("uploaded") || message.includes("Firmware update started") || message.includes("Restore complete")
              ? "text-green-400"
              : "text-red-400"
          }`}
        >
          {message}
        </p>
      )}

      {/* Apps tab */}
      {tab === "apps" && (() => {
        const groups = categorizeApps(appList);
        const GROUP_DEFS = [
          { id: "rotation", label: "In Rotation", icon: RotateCw, color: "text-green-400", dotColor: "bg-green-500", badge: "bg-green-500/10 text-green-400" },
          { id: "ondemand", label: "On Demand", icon: Zap, color: "text-blue-400", dotColor: "bg-blue-500", badge: "bg-blue-500/10 text-blue-400" },
          { id: "services", label: "Services", icon: Cog, color: "text-purple-400", dotColor: "bg-purple-500", badge: "bg-purple-500/10 text-purple-400" },
          { id: "disabled", label: "Disabled", icon: EyeOff, color: "text-gray-400", dotColor: "bg-gray-500", badge: "bg-gray-500/10 text-gray-400" },
        ] as const;

        return (
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <div>
              {loading && appList.length === 0 && <AppListSkeleton />}
              <div className="space-y-1">
                {GROUP_DEFS.map((g) => {
                  const items = groups[g.id as keyof typeof groups] || [];
                  if (items.length === 0) return null;
                  const collapsed = collapsedGroups[g.id] ?? false;
                  return (
                    <div key={g.id}>
                      <button
                        onClick={() => toggleGroup(g.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-[hsl(var(--accent))]/30"
                      >
                        {collapsed ? (
                          <ChevronRight className={`h-3.5 w-3.5 ${g.color}`} />
                        ) : (
                          <ChevronDown className={`h-3.5 w-3.5 ${g.color}`} />
                        )}
                        <g.icon className={`h-3.5 w-3.5 ${g.color}`} />
                        <span className={g.color}>{g.label}</span>
                        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${g.badge}`}>
                          {items.length}
                        </span>
                      </button>
                      {!collapsed && (
                        <div className="space-y-0.5 pb-1">
                          {items.map(([key, info]) => (
                            <div
                              key={key}
                              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
                                selected === key
                                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                                  : "hover:bg-[hsl(var(--accent))]/50"
                              }`}
                              onClick={() => loadSource(key)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {g.id === "rotation" && info.slot != null && (
                                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-[hsl(var(--accent))] text-[10px] font-mono font-bold">
                                    {info.slot}
                                  </span>
                                )}
                                {g.id !== "rotation" && (
                                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${g.dotColor}`} />
                                )}
                                <span className="truncate">{info.name || key}</span>
                                {info.origin && ORIGIN_BADGE[info.origin] && (
                                  <span
                                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ORIGIN_BADGE[info.origin].color}`}
                                  >
                                    {ORIGIN_BADGE[info.origin].label}
                                  </span>
                                )}
                                {info.error && (
                                  <span className="flex-shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                                    ERR
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-shrink-0 gap-0.5">
                                {!info.headless && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      showApp(key);
                                    }}
                                    className="rounded p-1 hover:bg-[hsl(var(--background))]"
                                    title="Show on display"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {info.origin !== "builtin" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      confirmDeleteApp(key);
                                    }}
                                    className="rounded p-1 text-red-400 hover:bg-[hsl(var(--background))]"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              {selected && selectedInfo ? (
                <div className="space-y-4">
                  {/* App header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{selectedInfo.meta?.name || selectedName}</h2>
                      {selectedInfo.origin && ORIGIN_BADGE[selectedInfo.origin] && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${ORIGIN_BADGE[selectedInfo.origin].color}`}
                        >
                          {ORIGIN_BADGE[selectedInfo.origin].label}
                        </span>
                      )}
                      {selectedInfo.meta?.version && (
                        <span className="rounded bg-[hsl(var(--accent))] px-1.5 py-0.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                          v{selectedInfo.meta.version}
                        </span>
                      )}
                      {selectedInfo.inLoop && (
                        <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                          Slot {selectedInfo.slot}
                        </span>
                      )}
                    </div>
                    {isEditable && (
                      <button
                        onClick={saveScript}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Deploy
                      </button>
                    )}
                  </div>

                  {/* Metadata bar */}
                  {(selectedInfo.meta?.desc || selectedInfo.meta?.author || selectedInfo.meta?.display || selectedInfo.headless || selectedInfo.skipped || selectedInfo.meta?.requires) && (
                    <div className="space-y-1.5 rounded-lg bg-[hsl(var(--accent))]/50 px-3 py-2.5 text-xs">
                      {selectedInfo.meta?.desc && (
                        <p className="text-[hsl(var(--muted-foreground))]">{selectedInfo.meta.desc}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[hsl(var(--muted-foreground))]">
                        {selectedInfo.meta?.author && (
                          <span>Author: <span className="text-[hsl(var(--foreground))]">{selectedInfo.meta.author}</span></span>
                        )}
                        {selectedInfo.meta?.display && (
                          <span>Display: <span className="text-[hsl(var(--foreground))]">{selectedInfo.meta.display.width}x{selectedInfo.meta.display.height}</span></span>
                        )}
                        {selectedInfo.headless && (
                          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-purple-400">Headless</span>
                        )}
                        {selectedInfo.skipped && (
                          <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-yellow-400">Skipped</span>
                        )}
                        {selectedInfo.ondemand && (
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400">On Demand</span>
                        )}
                      </div>
                      {selectedInfo.meta?.requires && selectedInfo.meta.requires.length > 0 && (
                        <div className="flex gap-1.5 items-center text-[hsl(var(--muted-foreground))]">
                          Requires:
                          {selectedInfo.meta.requires.map((r) => (
                            <span key={r.name} className={`rounded px-1.5 py-0.5 text-[10px] ${r.missing ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                              {r.name} {r.missing ? "✗" : "✓"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Built-in / Pushed info panel */}
                  {selectedInfo.origin !== "script" ? (
                    <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-6">
                      <div className="flex flex-col items-center gap-3 text-center">
                        {selectedInfo.origin === "builtin" ? (
                          <>
                            <div className="rounded-full bg-blue-500/10 p-3">
                              <Cpu className="h-6 w-6 text-blue-400" />
                            </div>
                            <div>
                              <p className="font-medium text-[hsl(var(--foreground))]">Built-in App</p>
                              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                                This app is part of the AWTRIX NG firmware and has no editable source code.
                              </p>
                            </div>
                          </>
                        ) : selectedInfo.origin === "pushed" ? (
                          <>
                            <div className="rounded-full bg-amber-500/10 p-3">
                              <Upload className="h-6 w-6 text-amber-400" />
                            </div>
                            <div>
                              <p className="font-medium text-[hsl(var(--foreground))]">Pushed App</p>
                              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                                This app receives data via MQTT or HTTP push. It has no Berry script to edit.
                              </p>
                            </div>
                            {selectedInfo.icon && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                                <span>Icon ID:</span>
                                <span className="rounded bg-[hsl(var(--accent))] px-1.5 py-0.5 font-mono">{selectedInfo.icon}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="rounded-full bg-gray-500/10 p-3">
                              <Info className="h-6 w-6 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-[hsl(var(--foreground))]">Inactive App</p>
                              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                                This app slot is registered but not currently active on the device.
                              </p>
                            </div>
                          </>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                          <span>In rotation:</span>
                          <span className={selectedInfo.inLoop ? "text-green-400" : "text-gray-400"}>
                            {selectedInfo.inLoop ? "Yes" : "No"}
                          </span>
                          <span>Slot:</span>
                          <span>{selectedInfo.slot ?? "—"}</span>
                          {selectedInfo.config !== undefined && (
                            <>
                              <span>Configurable:</span>
                              <span>{selectedInfo.config ? "Yes" : "No"}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Config editor for scripts */}
                      {(scriptParams.length > 0 || scriptSecrets.length > 0) && (
                        <ConfigEditor
                          params={scriptParams}
                          secrets={scriptSecrets}
                          values={appConfig}
                          saving={savingConfig}
                          onSave={saveConfig}
                        />
                      )}

                      {/* Source code editor */}
                      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <Code className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                            Source Code
                          </span>
                        </div>
                        <div className="p-1">
                          <ScriptEditor
                            value={source}
                            onChange={setSource}
                            height="450px"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                  Select an app to view its details
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Settings tab */}
      {tab === "settings" && loading && <SettingsSkeleton />}
      {tab === "settings" && !loading && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <h2 className="mb-4 text-lg font-semibold">Device Settings</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {SAFE_SETTINGS.filter((s) => s.key in settings).map((s) => {
              const val = settings[s.key];
              return (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-[hsl(var(--muted-foreground))] min-w-0">
                    {s.label}
                  </label>
                  {s.type === "bool" ? (
                    <button
                      onClick={() => updateSetting(s.key, !val)}
                      className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                        val
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {val ? "ON" : "OFF"}
                    </button>
                  ) : s.type === "slider" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={s.min ?? 0}
                        max={s.max ?? 255}
                        step={s.step ?? 1}
                        value={typeof val === "number" ? val : 0}
                        onChange={(e) => updateSettingDebounced(s.key, Number(e.target.value))}
                        className="w-28"
                      />
                      <span className="w-12 text-right text-xs font-mono tabular-nums text-[hsl(var(--muted-foreground))]">
                        {typeof val === "number" ? val : 0}
                      </span>
                    </div>
                  ) : s.type === "color" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={intToHex(val)}
                        onChange={(e) => updateSetting(s.key, hexToInt(e.target.value))}
                        className="h-7 w-7 cursor-pointer rounded border border-[hsl(var(--input))] bg-transparent p-0"
                      />
                      <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">
                        {intToHex(val)}
                      </span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={typeof val === "number" ? val : 0}
                      onChange={(e) => updateSetting(s.key, Number(e.target.value))}
                      className="w-24 rounded-md border border-[hsl(var(--input))] bg-transparent px-2 py-1 text-sm text-right"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backup tab */}
      {tab === "backup" && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportBackup}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export Backup"}
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm transition-colors hover:bg-[hsl(var(--accent))]">
              <Upload className="h-4 w-4" />
              Restore from File
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !host) return;
                  const form = new FormData();
                  form.append("file", file);
                  try {
                    const response = await fetch(
                      `${basePath}/api/backup/${encodedHost}/restore`,
                      { method: "POST", body: form },
                    );
                    const payload = await response.json();
                    if (!response.ok) {
                      throw new Error(payload.detail || `Restore failed (HTTP ${response.status})`);
                    }
                    const restored = payload.restored ?? {};
                    const warnings: string[] = Array.isArray(restored.warnings) ? restored.warnings : [];
                    const reboot = restored.requires_reboot ? "; reboot required" : "";
                    const warningSummary = warnings.length
                      ? `; ${warnings.length} warning(s): ${warnings.slice(0, 2).join("; ")}`
                      : "";
                    setMessage(`Restore complete${reboot}${warningSummary}`);
                    setTimeout(() => setMessage(""), 5000);
                    loadAll();
                  } catch (err) {
                    setMessage(String(err));
                  }
                }}
              />
            </label>
          </div>

          {backupStoragePath && (
            <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--accent))]/50 px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
              Storage: <code className="font-mono">{backupStoragePath}</code>
            </div>
          )}

          {backups.length > 0 && (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <div className="border-b border-[hsl(var(--border))] px-4 py-3">
                <h3 className="text-sm font-semibold">Previous Backups</h3>
              </div>
              <div className="divide-y divide-[hsl(var(--border))]">
                {backups.map((b) => (
                  <div key={b.filename} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-[hsl(var(--muted-foreground))] truncate">{b.filename}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {(b.size / 1024).toFixed(1)} KB
                      </span>
                      <a
                        href={`${basePath}/api/backup/${encodedHost}/download/${encodeURIComponent(b.filename)}`}
                        download
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-400/10"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {backups.length === 0 && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No backups yet. Export to save all scripts, settings and app configuration.
            </p>
          )}
        </div>
      )}

      {/* Logs tab */}
      {tab === "logs" && host && <DeviceLogs host={host} />}

      {/* Files tab */}
      {tab === "files" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filesDir}
              onChange={(e) => {
                const d = e.target.value as "/ICONS" | "/MELODIES" | "/MP3";
                setFilesDir(d);
                loadFiles(d);
              }}
              className="rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="/ICONS">Icons</option>
              <option value="/MELODIES">Melodies</option>
              <option value="/MP3">MP3</option>
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm transition-colors hover:bg-[hsl(var(--accent))]">
              <FileUp className="h-4 w-4" />
              Upload
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f || !host) return;
                  const form = new FormData();
                  form.append("file", f);
                  try {
                    await fetch(
                      `${basePath}/api/management/${encodedHost}/files?directory=${encodeURIComponent(filesDir)}`,
                      { method: "POST", body: form },
                    );
                    setMessage("File uploaded");
                    setTimeout(() => setMessage(""), 3000);
                    loadFiles();
                  } catch (err) {
                    setMessage(String(err));
                  }
                }}
              />
            </label>
            <button
              onClick={() => loadFiles()}
              disabled={filesLoading}
              className="flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${filesLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {files.length > 0 ? (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <div className="divide-y divide-[hsl(var(--border))]">
                {files.map((f) => {
                  const fileUrl = `${basePath}/api/management/${encodedHost}/files/content?name=${encodeURIComponent(f.name)}&directory=${encodeURIComponent(filesDir)}`;
                  const isIcon = filesDir === "/ICONS";
                  const isAudio = filesDir === "/MELODIES" || filesDir === "/MP3";
                  const isPlaying = playingFile === f.name;
                  return (
                    <div key={f.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {isIcon && (
                        <div className="flex items-center gap-2">
                          <img
                            src={fileUrl}
                            alt={f.name}
                            className="h-8 w-8 object-contain"
                            style={{ imageRendering: "pixelated" }}
                            onLoad={(e) => {
                              const img = e.target as HTMLImageElement;
                              setIconDims((prev) => ({ ...prev, [f.name]: `${img.naturalWidth}×${img.naturalHeight}` }));
                            }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                          {iconDims[f.name] && (
                            <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                              {iconDims[f.name]}
                            </span>
                          )}
                        </div>
                      )}
                      {isAudio && (
                        <button
                          onClick={() => {
                            if (isPlaying) {
                              setPlayingFile(null);
                            } else {
                              setPlayingFile(f.name);
                            }
                          }}
                          className="rounded p-1 hover:bg-[hsl(var(--accent))]"
                          title={isPlaying ? "Stop" : "Play"}
                        >
                          {isPlaying ? <Music className="h-4 w-4 text-green-400" /> : <Play className="h-4 w-4" />}
                        </button>
                      )}
                      <span className="flex-1 truncate">{f.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {f.size != null && (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            {f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} KB`}
                          </span>
                        )}
                        <a
                          href={fileUrl}
                          download={f.name}
                          className="rounded p-1 hover:bg-[hsl(var(--accent))]"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={async () => {
                            if (!host) return;
                            try {
                              await api(
                                `/management/${encodedHost}/files?name=${encodeURIComponent(f.name)}&directory=${encodeURIComponent(filesDir)}`,
                                { method: "DELETE" },
                              );
                              loadFiles();
                            } catch {
                              /* ignore */
                            }
                          }}
                          className="rounded p-1 text-red-400 hover:bg-[hsl(var(--accent))]"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {isAudio && isPlaying && (
                        <audio
                          src={fileUrl}
                          autoPlay
                          onEnded={() => setPlayingFile(null)}
                          className="hidden"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {filesLoading ? "Loading..." : "No files in this directory."}
            </p>
          )}
        </div>
      )}

      {/* Advanced tab */}
      {tab === "advanced" && (
        <div className="space-y-6">
          {/* System Info */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <h2 className="text-lg font-semibold">System Information</h2>
            </div>
            {deviceInfo ? (() => {
              const boardKey = String(deviceInfo.boardType || "");
              const heap = formatHeap(deviceInfo.freeHeapBytes, deviceInfo.minFreeHeapBytes ? Number(deviceInfo.freeHeapBytes) / 0.8 : undefined);
              const matrixW = deviceInfo.matrixWidth ?? deviceInfo.width;
              const matrixH = deviceInfo.matrixHeight ?? deviceInfo.height;
              return (
                <div className="space-y-5">
                  {/* Device identity card */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 rounded-lg bg-[hsl(var(--accent))]/50 p-3">
                      <Cpu className="h-8 w-8 text-[hsl(var(--primary))]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">{String(deviceInfo.hostname || host)}</p>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        {BOARD_LABELS[boardKey] || boardKey || "Unknown board"}
                      </p>
                      <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                        AWTRIX NG {String(deviceInfo.version || "?")} · {String(deviceInfo.soc || "?")} · {matrixW && matrixH ? `${matrixW}×${matrixH} pixels` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Free Heap with bar */}
                    <div className="rounded-lg bg-[hsl(var(--accent))]/30 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Free Heap</p>
                      <p className="mt-0.5 text-lg font-semibold font-mono">{heap.text}</p>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-[hsl(var(--border))]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(heap.pct || 75, 100)}%`,
                            backgroundColor: heap.pct > 50 ? "hsl(142, 71%, 45%)" : heap.pct > 20 ? "hsl(48, 96%, 53%)" : "hsl(0, 72%, 51%)",
                          }}
                        />
                      </div>
                    </div>

                    {/* Uptime */}
                    <div className="rounded-lg bg-[hsl(var(--accent))]/30 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Uptime</p>
                      <p className="mt-0.5 text-lg font-semibold font-mono">
                        {deviceInfo.uptimeSeconds != null ? formatUptime(deviceInfo.uptimeSeconds) : "—"}
                      </p>
                    </div>

                    {/* WiFi */}
                    <div className="rounded-lg bg-[hsl(var(--accent))]/30 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">WiFi</p>
                      <p className="mt-0.5 text-sm font-semibold flex items-center gap-1.5">
                        <Wifi className="h-3.5 w-3.5" />
                        {String((deviceInfo.wifi as Record<string, unknown>)?.host || deviceInfo.ssid || "—")}
                      </p>
                      {deviceInfo.wifiRssi != null && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{String(deviceInfo.wifiRssi)} dBm</p>
                      )}
                    </div>

                    {/* Battery (if present) */}
                    {deviceInfo.batteryPercent != null && (
                      <div className="rounded-lg bg-[hsl(var(--accent))]/30 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Battery</p>
                        <p className="mt-0.5 text-lg font-semibold font-mono">{String(deviceInfo.batteryPercent)}%</p>
                        {deviceInfo.batteryVoltage != null && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{Number(deviceInfo.batteryVoltage).toFixed(2)}V {deviceInfo.usbPower ? "· USB" : ""}</p>
                        )}
                      </div>
                    )}

                    {/* FPS */}
                    {deviceInfo.fps != null && (
                      <div className="rounded-lg bg-[hsl(var(--accent))]/30 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Render</p>
                        <p className="mt-0.5 text-lg font-semibold font-mono">{String(deviceInfo.fps)} fps</p>
                      </div>
                    )}

                    {/* Messages */}
                    {deviceInfo.messageCount != null && (
                      <div className="rounded-lg bg-[hsl(var(--accent))]/30 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Messages</p>
                        <p className="mt-0.5 text-lg font-semibold font-mono">{Number(deviceInfo.messageCount).toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {/* Detail rows */}
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {[
                      ["IP Address", deviceInfo.ipAddress || deviceInfo.ip],
                      ["MAC Address", deviceInfo.macAddress || deviceInfo.mac],
                      ["Flash Size", deviceInfo.flashSize ? `${(Number(deviceInfo.flashSize) / 1048576).toFixed(1)} MB` : null],
                      ["Reset Reason", deviceInfo.resetReason],
                      ["MQTT", (deviceInfo.mqtt as Record<string, unknown>)?.state],
                    ].filter(([, v]) => v != null && v !== "").map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between gap-2 rounded px-2 py-1 hover:bg-[hsl(var(--accent))]/30">
                        <span className="text-[hsl(var(--muted-foreground))]">{String(label)}</span>
                        <span className="font-mono text-xs">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Device offline</p>
            )}
          </div>

          {/* System Settings (editable) */}
          {systemInfo && (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Settings className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                <h2 className="text-lg font-semibold">System Settings</h2>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {[
                  { key: "ntpServer", label: "NTP Server", wide: false },
                  { key: "tz", label: "Timezone (POSIX)", wide: true },
                  { key: "tzName", label: "TZ Name", wide: false },
                  { key: "tempOffset", label: "Temp Offset", wide: false },
                  { key: "humOffset", label: "Humidity Offset", wide: false },
                  { key: "minBrightness", label: "Min Brightness", wide: false },
                  { key: "maxBrightness", label: "Max Brightness", wide: false },
                  { key: "rotate", label: "Rotate Display", wide: false },
                  { key: "swapButtons", label: "Swap Buttons", wide: false },
                  { key: "debugMode", label: "Debug Mode", wide: false },
                  { key: "scriptingEnabled", label: "Scripting", wide: false },
                  { key: "haDiscovery", label: "HA Discovery", wide: false },
                ].filter((s) => s.key in systemInfo).map((s) => {
                  const val = systemInfo[s.key];
                  const isBool = typeof val === "boolean";
                  return (
                    <div key={s.key} className={`flex items-center justify-between gap-2 ${s.wide ? "sm:col-span-2" : ""}`}>
                      <label className="text-sm text-[hsl(var(--muted-foreground))] flex-shrink-0">{s.label}</label>
                      {isBool ? (
                        <button
                          onClick={async () => {
                            try {
                              await api(`/management/${encodedHost}/system`, {
                                method: "PATCH",
                                body: JSON.stringify({ [s.key]: !val }),
                              });
                              setSystemInfo((prev) => prev ? { ...prev, [s.key]: !val } : prev);
                            } catch { /* ignore */ }
                          }}
                          className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                            val ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {val ? "ON" : "OFF"}
                        </button>
                      ) : (
                        <input
                          type={typeof val === "number" ? "number" : "text"}
                          value={String(val ?? "")}
                          onChange={(e) => {
                            const newVal = typeof val === "number" ? Number(e.target.value) : e.target.value;
                            setSystemInfo((prev) => prev ? { ...prev, [s.key]: newVal } : prev);
                          }}
                          onBlur={async (e) => {
                            const newVal = typeof val === "number" ? Number(e.target.value) : e.target.value;
                            try {
                              await api(`/management/${encodedHost}/system`, {
                                method: "PATCH",
                                body: JSON.stringify({ [s.key]: newVal }),
                              });
                            } catch { /* ignore */ }
                          }}
                          className={`${s.wide ? "flex-1" : "w-36"} rounded-md border border-[hsl(var(--input))] bg-transparent px-2 py-1 text-sm ${typeof val === "number" ? "text-right" : ""} font-mono`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Firmware */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                <h2 className="text-lg font-semibold">Firmware</h2>
              </div>
              <button
                onClick={loadFirmware}
                disabled={fwLoading}
                className="flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
              >
                <RefreshCw className={`h-3 w-3 ${fwLoading ? "animate-spin" : ""}`} />
                Check updates
              </button>
            </div>

            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Current version</span>
                <span className="font-mono">{deviceInfo ? String(deviceInfo.version || "unknown") : "—"}</span>
              </div>
              {firmware && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Latest version</span>
                    <span className="font-mono">{String(firmware.latest || "unknown")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Status</span>
                    <span className={firmware.available ? "text-amber-400" : "text-green-400"}>
                      {firmware.available
                        ? "Update available"
                        : firmware.supported === false
                          ? "Not supported"
                          : "Up to date"}
                    </span>
                  </div>
                  {Boolean(firmware.release_url) && (
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">Release notes</span>
                      <a
                        href={String(firmware.release_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:underline"
                      >
                        GitHub <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>

            {firmware && Boolean(firmware.available) && (
              <button
                onClick={async () => {
                  if (!host || fwInstalling) return;
                  setFwInstalling(true);
                  try {
                    await api(`/management/${encodedHost}/firmware`, {
                      method: "POST",
                      body: JSON.stringify({
                        confirm: true,
                        version: firmware.latest,
                        image: firmware.image,
                      }),
                    });
                    setMessage("Firmware update started — device will reboot");
                    setTimeout(() => setMessage(""), 10000);
                  } catch (e) {
                    setMessage(String(e));
                  } finally {
                    setFwInstalling(false);
                  }
                }}
                disabled={fwInstalling}
                className="mt-4 flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                {fwInstalling ? "Installing..." : `Update to ${firmware.latest}`}
              </button>
            )}

            {/* Manual firmware upload */}
            <div className="mt-4 border-t border-[hsl(var(--border))] pt-4">
              <h3 className="mb-2 text-sm font-medium text-[hsl(var(--muted-foreground))]">Manual Upload</h3>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm transition-colors hover:bg-[hsl(var(--accent))]/50">
                <Upload className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                <span className="text-[hsl(var(--muted-foreground))]">Upload firmware file (.awup / .bin)</span>
                <input
                  type="file"
                  accept=".awup,.bin"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !host) return;
                    const form = new FormData();
                    form.append("firmware", f);
                    try {
                      await fetch(`${basePath}/api/management/${encodedHost}/firmware/upload`, {
                        method: "POST",
                        body: form,
                      });
                      setMessage("Firmware update started — device will reboot");
                      setTimeout(() => setMessage(""), 10000);
                    } catch (err) {
                      setMessage(String(err));
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.title.includes("Delete") ? "Delete" : "Reboot"}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
