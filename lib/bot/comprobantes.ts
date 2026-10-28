import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbDeOrg } from "@/lib/supabase/org";
import { descargarMedia } from "@/lib/bot/whatsapp";

/**
 * Comprobantes de pago que los alumnos mandan por WhatsApp (fotos o PDF).
 *
 * Se guardan en un depósito PRIVADO de Supabase Storage: no hay ninguna URL
 * pública. Para verlos, el panel pide un enlace firmado que vence solo, y ese
 * enlace se genera únicamente del lado del servidor, después de comprobar que
 * quien mira es admin. Los profes no tienen forma de llegar a estos archivos.
 */

export const BUCKET_COMPROBANTES = "comprobantes";

/** Cuánto dura el enlace para ver un comprobante desde el panel. */
const MINUTOS_ENLACE = 60;

/** Lo que aceptamos guardar. WhatsApp convierte las fotos a JPEG; los bancos
 *  suelen mandar el comprobante en PDF. */
const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function esTipoComprobante(mime: string | undefined): boolean {
  return Boolean(mime && EXTENSION_POR_TIPO[mime.split(";")[0].trim()]);
}

export type Adjunto = { path: string; tipo: string };

/**
 * Baja un archivo de WhatsApp y lo guarda en el depósito de comprobantes.
 * Nunca tira error: si algo falla devuelve null y el mensaje se procesa igual,
 * sin el archivo (el que llama decide cómo avisarlo).
 */
export async function guardarAdjuntoWhatsApp(
  orgId: string,
  conversacionId: string,
  mediaId: string,
): Promise<Adjunto | null> {
  const db = dbDeOrg(orgId);
  if (!db) return null;

  const media = await descargarMedia(orgId, mediaId);
  if (!media) return null;

  const tipo = media.mime.split(";")[0].trim();
  const extension = EXTENSION_POR_TIPO[tipo];
  if (!extension) {
    console.error(`[comprobantes] tipo de archivo no soportado: ${tipo}`);
    return null;
  }

  // Cada academia en su carpeta. Los archivos de antes del multi-cliente
  // quedaron sin ella y se siguen leyendo igual: la ruta sale de la base.
  const path = `${orgId}/${conversacionId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage
    .from(BUCKET_COMPROBANTES)
    .upload(path, media.bytes, { contentType: tipo, upsert: false });
  if (error) {
    console.error("[comprobantes] no se pudo guardar el archivo:", error.message);
    return null;
  }
  return { path, tipo };
}

/**
 * Enlaces temporales para ver comprobantes. Solo se usa desde páginas que ya
 * pasaron por requireAdmin: quien tiene el enlace ve el archivo.
 *
 * Va sin organización porque el depósito no la tiene: las rutas que recibe
 * tienen que salir de mensajes ya leídos con la organización de quien mira.
 */
export async function enlacesFirmados(
  paths: string[],
): Promise<Map<string, string>> {
  const enlaces = new Map<string, string>();
  const db = createAdminClient();
  if (!db || paths.length === 0) return enlaces;

  const { data, error } = await db.storage
    .from(BUCKET_COMPROBANTES)
    .createSignedUrls(paths, MINUTOS_ENLACE * 60);
  if (error) {
    console.error("[comprobantes] no se pudieron firmar los enlaces:", error.message);
    return enlaces;
  }
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) enlaces.set(d.path, d.signedUrl);
  }
  return enlaces;
}

/** Baja un comprobante del depósito (en base64) para mostrárselo al bot.
 *  Devuelve null si no se pudo leer. */
export async function leerAdjuntoBase64(path: string): Promise<string | null> {
  const db = createAdminClient();
  if (!db) return null;
  const { data, error } = await db.storage
    .from(BUCKET_COMPROBANTES)
    .download(path);
  if (error || !data) {
    console.error("[comprobantes] no se pudo leer el archivo:", error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer()).toString("base64");
}
