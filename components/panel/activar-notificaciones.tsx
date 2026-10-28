"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  activarNotificacionesAction,
  desactivarNotificacionesAction,
} from "@/app/actions/push";

/**
 * Botón para activar las notificaciones push en ESTE celular/compu.
 *
 * Cada dispositivo se activa por separado (el permiso lo da el navegador, no la
 * cuenta): si Laura lo activa en el celular, en la compu tiene que activarlo de
 * nuevo. Por eso el texto dice "en este dispositivo".
 *
 * Ojo iPhone: Safari solo permite push si la web está instalada en la pantalla
 * de inicio. Si detectamos iOS sin instalar, en vez del botón mostramos cómo
 * instalarla (si no, el botón fallaría sin explicación).
 */

type Estado =
  | "cargando"
  | "no-soportado"
  | "necesita-instalar"
  | "bloqueado"
  | "desactivado"
  | "activado";

/** La clave VAPID viene en base64url y el navegador la pide como bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = window.atob(normal);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let vivo = true;

    (async () => {
      if (
        !clavePublica ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (vivo) setEstado("no-soportado");
        return;
      }

      // iPhone/iPad: sin instalar en la pantalla de inicio no hay push posible.
      const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      if (esIOS && !instalada) {
        if (vivo) setEstado("necesita-instalar");
        return;
      }

      if (Notification.permission === "denied") {
        if (vivo) setEstado("bloqueado");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Autocuración: reenviamos la suscripción al servidor por si el
          // guardado original falló (p. ej. la tabla aún no existía). El
          // guardado es idempotente, así que repetirlo no duplica nada. Si
          // ESTE reenvío falla, lo mostramos: el celu tiene la suscripción
          // local pero el servidor no la conoce, así que NO llegarían avisos.
          const datos = sub.toJSON();
          try {
            const r = await activarNotificacionesAction({
              endpoint: sub.endpoint,
              keys: {
                p256dh: datos.keys?.p256dh ?? "",
                auth: datos.keys?.auth ?? "",
              },
            });
            if (!r.ok) {
              if (vivo) {
                setError(r.error ?? "El servidor no pudo guardar la suscripción.");
                setEstado("desactivado");
              }
              return;
            }
          } catch (e) {
            if (vivo) {
              setError(
                "No se pudo contactar al servidor: " +
                  (e instanceof Error ? e.message : "error desconocido"),
              );
              setEstado("desactivado");
            }
            return;
          }
        }
        if (vivo) setEstado(sub ? "activado" : "desactivado");
      } catch {
        if (vivo) setEstado("no-soportado");
      }
    })();

    return () => {
      vivo = false;
    };
  }, [clavePublica]);

  const activar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "desactivado");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(clavePublica!) as BufferSource,
      });

      const datos = sub.toJSON();
      const r = await activarNotificacionesAction({
        endpoint: sub.endpoint,
        keys: {
          p256dh: datos.keys?.p256dh ?? "",
          auth: datos.keys?.auth ?? "",
        },
      });

      if (!r.ok) {
        // No quedó guardada en la base: deshago la suscripción para que el
        // botón no mienta diciendo "activadas".
        await sub.unsubscribe().catch(() => {});
        setError(r.error ?? "No se pudo activar. Probá de nuevo.");
        setEstado("desactivado");
        return;
      }
      setEstado("activado");
    } catch {
      // Falla desconocida: deshacemos la suscripción del navegador para que
      // no quede "activado" en el celu sin estar guardado en el servidor.
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        await sub?.unsubscribe();
      } catch {}
      setError("No se pudo activar. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await desactivarNotificacionesAction(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setEstado("desactivado");
    } catch {
      setError("No se pudo desactivar. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  // Mientras chequea, o si el navegador no da para push, no molestamos.
  if (estado === "cargando" || estado === "no-soportado") return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={
              estado === "activado"
                ? "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blush text-ink"
                : "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blush-soft/70 text-blush-deep"
            }
          >
            {estado === "activado" ? (
              <BellRing className="h-5 w-5" strokeWidth={1.75} />
            ) : estado === "necesita-instalar" ? (
              <Share className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Bell className="h-5 w-5" strokeWidth={1.75} />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">
              {estado === "activado"
                ? "Notificaciones activadas en este dispositivo"
                : estado === "necesita-instalar"
                  ? "Instalá la app para recibir avisos"
                  : estado === "bloqueado"
                    ? "Notificaciones bloqueadas"
                    : "Notificaciones en el celular"}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {estado === "activado"
                ? "Te avisamos cuando una alumna agenda, pide lugar, se anota o seña."
                : estado === "necesita-instalar"
                  ? "En iPhone: tocá Compartir y elegí “Agregar a pantalla de inicio”. Después abrí la app desde el ícono y activalas desde acá."
                  : estado === "bloqueado"
                    ? "Las bloqueaste para este sitio. Habilitalas en los ajustes del navegador y volvé a entrar."
                    : "Enterate al toque cuando una alumna agenda, pide lugar, se anota o seña."}
            </p>
          </div>
        </div>

        {(estado === "desactivado" || estado === "activado") && (
          <button
            type="button"
            onClick={estado === "activado" ? desactivar : activar}
            disabled={ocupado}
            className={
              estado === "activado"
                ? "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-blush-soft/50 hover:text-ink disabled:opacity-50"
                : "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blush-soft px-4 py-2 text-sm font-medium text-blush-deep transition-colors hover:bg-blush-soft/70 disabled:opacity-50"
            }
          >
            {ocupado ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : estado === "activado" ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {estado === "activado" ? "Desactivar" : "Activar notificaciones"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-pago-sin">{error}</p>}
    </Card>
  );
}
