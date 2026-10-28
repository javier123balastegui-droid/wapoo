import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";

/**
 * Panel de control del bot (Panel → Bot): qué puede mandar por WhatsApp.
 *
 * Es la ÚNICA llave de los envíos automáticos. Se guarda en la base (tabla
 * bot_config) para que la dirección la maneje sin deploys ni variables de
 * Vercel, y se lee en cada envío, así que un cambio vale al instante.
 *
 * Si no se puede leer (tabla sin crear, base caída), cuenta como APAGADO: ante
 * la duda, el bot no le escribe a nadie.
 *
 * Lo que la directora escribe a mano desde el panel NO pasa por acá: eso sale
 * siempre.
 */

export type ModoBot = "APAGADO" | "PRUEBA" | "ENCENDIDO";

/** Cada tipo de mensaje que el bot manda por su cuenta tiene su llave. */
export type TipoEnvio = "responder" | "recordatorios" | "post_clase" | "agenda_profes";

export type ConfigBot = {
  modo: ModoBot;
  responder: boolean;
  recordatorios: boolean;
  post_clase: boolean;
  agenda_profes: boolean;
  /** Números que reciben mensajes en modo PRUEBA, solo dígitos. */
  numerosPrueba: string[];
  /** Link de la clase (Google Meet): el mismo para todas. */
  enlaceClase: string;
};

export const CONFIG_APAGADO: ConfigBot = {
  modo: "APAGADO",
  responder: false,
  recordatorios: false,
  post_clase: false,
  agenda_profes: false,
  numerosPrueba: [],
  enlaceClase: "",
};

/** Deja solo los dígitos: "+54 9 261 123-4567" → "5492611234567". */
export function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

/**
 * Lleva un número al formato en que llega de WhatsApp: los celulares
 * argentinos vienen como 549 + área + número. Así en el panel se puede
 * escribir "2617654321", "+54 9 261 765-4321" o "0261 7654321" y coincide
 * igual. Los números de otros países quedan como están.
 */
export function normalizarTelefono(telefono: string): string {
  let d = soloDigitos(telefono);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `549${d}`; // área + número, sin código de país
  else if (d.length === 12 && d.startsWith("54") && !d.startsWith("549")) d = `549${d.slice(2)}`;
  return d;
}

export function parsearNumeros(texto: string): string[] {
  return texto
    .split(/[\n,;]+/)
    .map(normalizarTelefono)
    .filter((n) => n.length >= 8);
}

export async function getConfigBot(orgId: string): Promise<ConfigBot> {
  const db = dbDeOrg(orgId);
  if (!db) return CONFIG_APAGADO;
  const { data, error } = await db
    .from("bot_config")
    .select("modo, responder, recordatorios, post_clase, agenda_profes, numeros_prueba, enlace_clase")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[bot] no pude leer bot_config, queda apagado:", error.message);
    return CONFIG_APAGADO;
  }
  const modo: ModoBot =
    data.modo === "ENCENDIDO" || data.modo === "PRUEBA" ? data.modo : "APAGADO";
  return {
    modo,
    responder: data.responder === true,
    recordatorios: data.recordatorios === true,
    post_clase: data.post_clase === true,
    agenda_profes: data.agenda_profes === true,
    numerosPrueba: parsearNumeros(String(data.numeros_prueba ?? "")),
    enlaceClase: String(data.enlace_clase ?? "").trim(),
  };
}

/** ¿Puede el bot mandarle este tipo de mensaje a este número? */
export async function puedeEnviar(orgId: string, tipo: TipoEnvio, telefono: string): Promise<boolean> {
  const c = await getConfigBot(orgId);
  if (c.modo === "APAGADO" || !c[tipo]) return false;
  if (c.modo === "PRUEBA") return c.numerosPrueba.includes(normalizarTelefono(telefono));
  return true;
}

export async function guardarConfigBot(
  orgId: string,
  c: Omit<ConfigBot, "numerosPrueba"> & { numerosPrueba: string },
): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  // Una fila por academia: se pisa la de esta organización.
  const { error } = await db.from("bot_config").upsert({
    modo: c.modo,
    responder: c.responder,
    recordatorios: c.recordatorios,
    post_clase: c.post_clase,
    agenda_profes: c.agenda_profes,
    numeros_prueba: parsearNumeros(c.numerosPrueba).join("\n"),
    enlace_clase: c.enlaceClase.trim(),
    actualizado_en: new Date().toISOString(),
  }, { onConflict: "organizacion_id" });
  if (error) throw new Error(error.message);
}
