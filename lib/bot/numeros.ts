import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Números de WhatsApp de cada academia (tabla whatsapp_numeros).
 *
 * Un mensaje entrante trae el id del número que lo recibió: con eso se sabe de
 * qué academia es. Y cada envío sale desde el número de su academia.
 *
 * Un número puede estar en la cuenta de Meta de la plataforma (usa
 * WHATSAPP_TOKEN y WHATSAPP_APP_SECRET de Vercel, compartidos) o en la de la
 * academia (su token y su secreto van cifrados en Supabase Vault y los
 * devuelve la función whatsapp_credenciales, que solo puede llamar el
 * servidor).
 *
 * Va con el cliente admin pelado a propósito: buscar un número por su id es
 * justamente averiguar de qué academia es, antes de saberlo.
 *
 * Modo en seco: con WHATSAPP_EN_SECO=1 no devuelve credenciales, así que nada
 * sale por WhatsApp aunque la academia tenga su token en la base. Lo usan los
 * scripts de prueba. Antes alcanzaba con borrar las variables de entorno, pero
 * eso no frena a un número con token propio.
 */

export type NumeroWhatsApp = {
  phoneNumberId: string;
  organizacionId: string;
  token: string;
  /** Secreto de la app de Meta, para verificar la firma de los avisos. */
  appSecret: string;
};

/** Se recuerda unos minutos para no consultar la base en cada parte de cada
 *  mensaje. Solo se recuerdan las lecturas que salieron bien: un error no
 *  queda guardado (ver lib/auth.ts). */
const MINUTOS_EN_MEMORIA = 5;
const memoria = new Map<string, { valor: NumeroWhatsApp | null; vence: number }>();

export function whatsappEnSeco(): boolean {
  return process.env.WHATSAPP_EN_SECO === "1";
}

async function buscar(
  clave: string,
  filtro: { p_phone_number_id?: string; p_org?: string },
): Promise<NumeroWhatsApp | null> {
  const guardado = memoria.get(clave);
  if (guardado && guardado.vence > Date.now()) return guardado.valor;

  const db = createAdminClient();
  if (!db) return null;
  const { data, error } = await db.rpc("whatsapp_credenciales", filtro);
  if (error) {
    console.error("[whatsapp] no pude leer las credenciales del número:", error.message);
    return null;
  }
  const fila = (data ?? [])[0] as
    | { phone_number_id: string; organizacion_id: string; token: string | null; app_secret: string | null }
    | undefined;
  const token = fila?.token || process.env.WHATSAPP_TOKEN || "";
  const appSecret = fila?.app_secret || process.env.WHATSAPP_APP_SECRET || "";
  const valor: NumeroWhatsApp | null =
    fila && token
      ? {
          phoneNumberId: fila.phone_number_id,
          organizacionId: fila.organizacion_id,
          token,
          appSecret,
        }
      : null;
  memoria.set(clave, { valor, vence: Date.now() + MINUTOS_EN_MEMORIA * 60_000 });
  return valor;
}

/** El número de una academia, para mandar. null si no tiene número, si falta
 *  el token o si está en modo en seco: entonces no sale nada (solo log). */
export async function numeroDeOrg(orgId: string): Promise<NumeroWhatsApp | null> {
  if (whatsappEnSeco()) return null;
  return buscar(`org:${orgId}`, { p_org: orgId });
}

/** El número que recibió un mensaje, con su academia. null si no es de
 *  ninguna academia (o si está desactivado): ese mensaje se ignora. */
export async function numeroPorPhoneId(phoneNumberId: string): Promise<NumeroWhatsApp | null> {
  if (!phoneNumberId) return null;
  return buscar(`id:${phoneNumberId}`, { p_phone_number_id: phoneNumberId });
}
