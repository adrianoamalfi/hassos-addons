import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const scale = 6;

interface Props {
  host: string;
  width?: number;
  height?: number;
  pollMs?: number;
}

export default function DisplayPreview({
  host,
  width = 52,
  height = 16,
  pollMs = 2000,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function draw() {
      try {
        const data = await api<{
          width: number;
          height: number;
          pixels: number[];
        }>(`/devices/${host}/screen`);
        if (!mounted) return;
        setError(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const frameWidth = data.width * scale;
        const frameHeight = data.height * scale;
        if (canvas.width !== frameWidth) canvas.width = frameWidth;
        if (canvas.height !== frameHeight) canvas.height = frameHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.pixels.length; i++) {
          const color = data.pixels[i];
          if (color === 0) continue;
          const x = i % data.width;
          const y = Math.floor(i / data.width);
          const r = (color >> 16) & 0xff;
          const g = (color >> 8) & 0xff;
          const b = color & 0xff;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x * scale, y * scale, scale - 0.5, scale - 0.5);
        }
      } catch {
        if (mounted) setError(true);
      }
    }

    draw();
    const timer = setInterval(draw, pollMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [host, pollMs]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-black p-2">
      <canvas
        ref={canvasRef}
        width={width * scale}
        height={height * scale}
        className="block"
        style={{ imageRendering: "pixelated" }}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-xs text-[hsl(var(--muted-foreground))]">
          Offline
        </div>
      )}
    </div>
  );
}
