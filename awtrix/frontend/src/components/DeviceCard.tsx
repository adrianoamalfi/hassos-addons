import { Link } from "react-router-dom";
import {
  Wifi,
  WifiOff,
  Settings,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import DisplayPreview from "./DisplayPreview";

interface DeviceInfo {
  host: string;
  name: string;
  online: boolean;
  info: {
    version?: string;
    freeRam?: number;
    uptime?: number;
    display?: { width: number; height: number };
  } | null;
}

interface Props {
  device: DeviceInfo;
  onReboot: (host: string) => void;
}

export default function DeviceCard({ device, onReboot }: Props) {
  const { host, name, online, info } = device;
  const ram = info?.freeRam
    ? `${(info.freeRam / 1024 / 1024).toFixed(1)} MB free`
    : "";
  const uptime = info?.uptime
    ? `${(info.uptime / 3600).toFixed(1)}h`
    : "";

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {online ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <h3 className="font-semibold">{name}</h3>
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {host}
        </span>
      </div>

      {online && (
        <div className="mb-3">
          <DisplayPreview
            host={host}
            width={info?.display?.width ?? 52}
            height={info?.display?.height ?? 16}
          />
        </div>
      )}

      <div className="mb-3 flex gap-3 text-xs text-[hsl(var(--muted-foreground))]">
        {info?.version && <span>FW {info.version}</span>}
        {ram && <span>{ram}</span>}
        {uptime && <span>Up {uptime}</span>}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => onReboot(host)}
            disabled={!online}
            className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] disabled:opacity-30"
            title="Reboot"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <Link
            to={`/device/${host}`}
            className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
        <Link
          to={`/device/${host}`}
          className="flex items-center gap-1 text-sm text-[hsl(var(--primary))] hover:underline"
        >
          Manage <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
