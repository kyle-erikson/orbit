import * as React from "react";
import { useState, useEffect, useCallback } from "react";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ToastInput = Omit<Toast, "id" | "open" | "onOpenChange">;

const DEFAULT_DURATION = 5000;

let toastCount = 0;

type Listener = (toasts: Toast[]) => void;
const listeners: Listener[] = [];
let memoryState: Toast[] = [];

function dispatch(toasts: Toast[]) {
  memoryState = toasts;
  listeners.forEach((l) => l(toasts));
}

function addToast(toast: ToastInput): string {
  const id = String(++toastCount);
  const newToast: Toast = {
    ...toast,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) removeToast(id);
    },
  };
  dispatch([newToast, ...memoryState]);

  if (toast.duration !== 0) {
    setTimeout(() => removeToast(id), toast.duration ?? DEFAULT_DURATION);
  }

  return id;
}

function removeToast(id: string) {
  dispatch(memoryState.filter((t) => t.id !== id));
}

export function toast(input: ToastInput): string {
  return addToast(input);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryState);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const idx = listeners.indexOf(setToasts);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  const dismiss = useCallback((id: string) => removeToast(id), []);

  return { toasts, toast, dismiss };
}
