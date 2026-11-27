import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface LogPage {
  next: number;
  lines: string[];
}

export default function DeviceLogs({ host }: { host: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [paused, setPaused] = useState(false);
  const cursor = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const errorCount = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    errorCount.current = 0;
    setPaused(false);

    async function read() {
      try {
        const after = cursor.current;
        const path = `/devices/${encodeURIComponent(host)}/logs`;
        let page = await api<LogPage>(`${path}?after=${after}`, { signal: controller.signal });
        const restarted = page.next < after;
        if (restarted) page = await api<LogPage>(`${path}?after=0`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        cursor.current = page.next;
        if (restarted || page.lines.length) {
          setLines((previous) => [...(restarted ? [] : previous), ...page.lines].slice(-500));
        }
        setError("");
        errorCount.current = 0;
      } catch (err) {
        if (controller.signal.aborted) return;
        errorCount.current += 1;
        if (errorCount.current >= 3) {
          setError("Device unreachable — polling stopped");
          setPaused(true);
          return;
        }
        setError(String(err));
      } finally {
        if (live && !controller.signal.aborted && errorCount.current < 3) {
          const delay = errorCount.current > 0 ? 3000 : 1000;
          timer = setTimeout(read, delay);
        }
      }
    }

    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [host, live, refresh]);

  useEffect(() => {
    if (follow.current && panel.current) panel.current.scrollTop = panel.current.scrollHeight;
  }, [lines]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Device logs</h2>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className="rounded border px-3 py-1" onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
          <button type="button" className="rounded border px-3 py-1" onClick={() => setLines([])}>Clear view</button>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live updates
          </label>
        </div>
      </div>
      {error && (
        <div className="mb-2 flex items-center gap-2 text-sm text-red-400">
          <p role="status">{error}</p>
          {paused && (
            <button type="button" className="rounded border border-red-400/30 px-2 py-0.5 text-xs hover:bg-red-400/10" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </button>
          )}
        </div>
      )}
      <div
        ref={panel}
        className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 font-mono text-xs leading-relaxed"
        onScroll={(e) => {
          const element = e.currentTarget;
          follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 16;
        }}
      >
        {lines.length ? lines.join("\n") : "No logs available"}
      </div>
    </section>
  );
}
