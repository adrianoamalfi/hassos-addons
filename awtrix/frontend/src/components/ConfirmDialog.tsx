import { useRef, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
        <div>
          <h3 className="mb-1 font-semibold text-[hsl(var(--foreground))]">{title}</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{message}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-1.5 text-sm transition-colors hover:bg-[hsl(var(--accent))]"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-md bg-red-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-red-600"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
