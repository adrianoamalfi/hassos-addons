import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import DeviceCard from "@/components/DeviceCard";
import { DeviceCardSkeleton } from "@/components/Skeleton";

interface Device {
  host: string;
  name: string;
  online: boolean;
  info: Record<string, unknown> | null;
}

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<Device[]>("/devices");
      setDevices(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReboot(host: string) {
    try {
      await api(`/devices/${encodeURIComponent(host)}/reboot`, { method: "POST" });
    } catch {
      // device rebooting
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Devices</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--secondary))] px-3 py-1.5 text-sm transition-colors hover:bg-[hsl(var(--accent))]"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {!loading && devices.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-12 text-center">
          <p className="mb-2 text-lg text-[hsl(var(--muted-foreground))]">
            No devices configured
          </p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Add your AWTRIX NG device IP in the add-on configuration.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && devices.length === 0
          ? Array.from({ length: 3 }).map((_, i) => <DeviceCardSkeleton key={i} />)
          : devices.map((d) => (
              <DeviceCard key={d.host} device={d} onReboot={handleReboot} />
            ))}
      </div>
    </div>
  );
}
