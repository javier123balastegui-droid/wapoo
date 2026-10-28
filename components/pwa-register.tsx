"use client";

import { useEffect } from "react";

/** Registra el service worker para que la web se pueda instalar como app. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Si falla el registro, la web sigue funcionando normal.
      });
    }
  }, []);
  return null;
}
