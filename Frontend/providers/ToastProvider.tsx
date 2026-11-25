"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (
    message: string,
    type?: ToastType
  ) => void;
}

const ToastContext =
  createContext<ToastContextValue | null>(
    null
  );

export function ToastProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<
    Toast[]
  >([]);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = "info"
    ) => {
      const id = Date.now();
      setToasts((current) => [
        ...current,
        { id, message, type },
      ]);

      setTimeout(() => {
        setToasts((current) =>
          current.filter(
            (toast) => toast.id !== id
          )
        );
      }, 3500);
    },
    []
  );

  return (
    <ToastContext.Provider
      value={{ showToast }}
    >
      {children}

      <div className="fixed top-4 right-4 z-[100] space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{
                opacity: 0,
                x: 40,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              exit={{
                opacity: 0,
                x: 40,
              }}
              className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md ${
                toast.type === "success"
                  ? "bg-emerald-600 text-white"
                  : toast.type === "error"
                    ? "bg-red-600 text-white"
                    : "bg-slate-900 text-white"
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      "useToast must be used within ToastProvider"
    );
  }

  return context;
}
