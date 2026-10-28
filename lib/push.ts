import "server-only";
import webpush from "web-push";
import { dbDeOrg } from "@/lib/supabase/org";

/**
 * Notificaciones push al celular del EQUIPO (admin y profes).
 *
 * Los alumnos NO reciben push (no tienen cuenta ni instalan la app): a ellos se
 * les avisa por WhatsApp (ver lib/bot/*). Esto es solo para que Laura y el
 * profe se enteren al toque de que algo cayó en la plataforma.
 *
 * Cómo funciona: cada celular donde alguien tocó "Activar notificaciones" queda
 * guardado en `push_suscripciones`. Para avisar, le mandamos el push a cada uno
 * de esos dispositivos, firmado con las claves VAPID.
 *
 * NUNCA tira error: un aviso que falla no puede romper el agendado de una clase.
 * Si faltan las claves VAPID o la tabla, degrada solo y lo deja en el log.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:contacto@academia-demo.test";

/** true si están las claves VAPID cargadas (sin ellas no se puede enviar). */
export function pushConfigurado(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

let vapidListo = false;
function prepararVapid(): boolean {
  if (!pushConfigurado()) return false;
  if (!vapidListo) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
    vapidListo = true;
  }
  return true;
}

export interface SuscripcionNavegador {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Guarda (o refresca) la suscripción de un dispositivo del equipo.
 *  Si ese endpoint ya estaba, lo actualiza en vez de duplicar. */
export async function guardarSuscripcion(
  orgId: string,
  profileId: string,
  sub: SuscripcionNavegador,
): Promise<{ ok: boolean; error?: string }> {
  const db = dbDeOrg(orgId);
  if (!db) return { ok: false, error: "No se pudo conectar. Probá más tarde." };
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { ok: false, error: "El navegador no devolvió una suscripción válida." };
  }

  const { error } = await db.from("push_suscripciones").upsert(
    {
      id: `ps-${Date.now()}`,
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push] no se pudo guardar la suscripción:", error.message);
    return {
      ok: false,
      error: "No se pudo activar. ¿Falta correr el SQL de push_suscripciones?",
    };
  }
  return { ok: true };
}

/** Borra la suscripción de este dispositivo (el usuario desactivó los avisos). */
export async function borrarSuscripcion(orgId: string, endpoint: string): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) return;
  await db.from("push_suscripciones").delete().eq("endpoint", endpoint);
}

/** Cuántos dispositivos tiene activados esta persona. */
export async function contarSuscripciones(orgId: string, profileId: string): Promise<number> {
  const db = dbDeOrg(orgId);
  if (!db) return 0;
  const { count } = await db
    .from("push_suscripciones")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  return count ?? 0;
}

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** Ruta a abrir al tocar la notificación (ej: "/panel/pedidos"). */
  url: string;
}

/**
 * Manda una notificación a TODO el equipo activo (admins y profes que hayan
 * activado los avisos). Pensado para novedades que requieren que alguien entre
 * a resolver algo.
 *
 * Nunca tira error. Devuelve cuántos avisos salieron (0 si no hay nadie
 * suscripto, si faltan las claves o si todavía no se corrió el SQL).
 */
/**
 * Manda una notificación SOLO a la dirección (perfiles con rol ADMIN).
 *
 * Es para lo que un profe no tiene que ver: el contenido de las charlas con las
 * alumnas y los movimientos de plata. Y no alcanza con que el panel les
 * rechace la entrada — el texto de una notificación se lee en la pantalla de
 * bloqueo del celular, sin abrir nada.
 */
export async function notificarAdmins(orgId: string, aviso: AvisoPush): Promise<number> {
  return notificar(orgId, aviso, "ADMIN");
}

/**
 * Manda una notificación SOLO a los profes.
 *
 * Lo único que les corresponde es su agenda: qué clases tienen y a quién se la
 * dan. Nada de charlas con alumnas, plata, altas ni aprobaciones.
 *
 * No existe a propósito una función que notifique a todos a la vez: si hiciera
 * falta, hay que elegir explícitamente a quién le llega cada aviso.
 */
export async function notificarProfes(orgId: string, aviso: AvisoPush): Promise<number> {
  return notificar(orgId, aviso, "PROFE");
}

async function notificar(
  orgId: string,
  aviso: AvisoPush,
  soloRol: "ADMIN" | "PROFE",
): Promise<number> {
  try {
    if (!prepararVapid()) {
      console.log("[push] (sin claves VAPID — no se envía)", aviso.titulo);
      return 0;
    }
    const db = dbDeOrg(orgId);
    if (!db) return 0;

    // Primero resolvemos a QUIÉN se le puede mandar este aviso.
    const { data: perfiles, error: errPerfiles } = await db
      .from("profiles")
      .select("id")
      .eq("rol", soloRol)
      .eq("activo", true);
    if (errPerfiles) {
      // Ante la duda no mandamos nada: es preferible que un aviso no llegue a
      // que llegue a quien no corresponde.
      console.error(
        "[push] no se pudo resolver quién puede recibir el aviso:",
        errPerfiles.message,
      );
      return 0;
    }
    const idsPermitidos = (perfiles ?? []).map((p: any) => p.id);
    if (idsPermitidos.length === 0) return 0;

    const { data: subs, error } = await db
      .from("push_suscripciones")
      .select("id, endpoint, p256dh, auth")
      .in("profile_id", idsPermitidos);
    if (error) {
      // Tabla sin crear todavía: degrada en silencio (solo log).
      console.error("[push] no se pudieron leer las suscripciones:", error.message);
      return 0;
    }
    if (!subs || subs.length === 0) return 0;

    const payload = JSON.stringify({
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      url: aviso.url,
    });

    // Endpoints que el navegador ya dio de baja: se limpian al final.
    const muertos: string[] = [];
    let enviados = 0;

    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
          );
          enviados++;
        } catch (e: any) {
          // 404/410 = la suscripción ya no existe (desinstalaron la app,
          // limpiaron datos, etc.). Se borra para no reintentar siempre.
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            muertos.push(s.endpoint);
          } else {
            const detalle = e instanceof Error ? e.message : "Error desconocido";
            console.error("[push] falló un envío:", detalle);
          }
        }
      }),
    );

    if (muertos.length > 0) {
      await db.from("push_suscripciones").delete().in("endpoint", muertos);
    }

    return enviados;
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[push] no se pudo notificar al equipo:", detalle);
    return 0;
  }
}
