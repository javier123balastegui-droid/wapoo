"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  guardarSuscripcion,
  borrarSuscripcion,
  contarSuscripciones,
  type SuscripcionNavegador,
} from "@/lib/push";

/** Activa las notificaciones en ESTE dispositivo para el usuario logueado.
 *  Usa getCurrentUser (NO requireUser): un redirect dentro de una server action
 *  llamada por fetch rompe el guardado en vez de devolver un error legible. */
export async function activarNotificacionesAction(
  sub: SuscripcionNavegador,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      error: "Se cerró tu sesión. Volvé a iniciar sesión y probá de nuevo.",
    };
  }
  return guardarSuscripcion(user.organizacionId, user.id, sub);
}

/** Desactiva las notificaciones en este dispositivo. */
export async function desactivarNotificacionesAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await borrarSuscripcion(user.organizacionId, endpoint);
  return { ok: true };
}

/** Cuántos dispositivos tiene activados el usuario logueado. */
export async function contarMisDispositivosAction(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  return contarSuscripciones(user.organizacionId, user.id);
}
