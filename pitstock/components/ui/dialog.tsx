"use client";

import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/* ── context ── */
const DialogContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

/* ── root ── */
export function Dialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      onOpenChange?.(v);
      setUncontrolledOpen(v);
    },
    [onOpenChange],
  );
  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

/* ── trigger ── */
export function DialogTrigger({
  children,
  asChild,
  ...props
}: ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) {
  const { setOpen } = useContext(DialogContext);
  return (
    <button type="button" onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  );
}

/* ── overlay + content ── */
export function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open, setOpen } = useContext(DialogContext);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      {/* panel */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl border border-foreground/10 bg-background p-6 shadow-xl",
          "animate-in fade-in zoom-in-95 duration-200",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-sm text-foreground/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <XIcon className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

/* ── helpers ── */
export function DialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 space-y-1.5", className)}>{children}</div>
  );
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("text-lg font-semibold", className)}>{children}</h2>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-foreground/60", className)}>{children}</p>
  );
}
