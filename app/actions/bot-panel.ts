"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  getConversacionBotDetalle,
  guardarMensaje,
  setEstadoConversacionPorId,
} from "@/lib/bot/conversaciones";
import { enviarWhatsApp } from "@/lib/bot/whatsapp";
import { guardarConfigBot, type ModoBot } from "@/lib/bot/config";
import { registrarCargaSaldo } from "@/lib/bot/uso";

/** La directora toma el control de una conversación (HUMANO) o se la devuelve al
 *  bot (BOT). Es por conversación: no afecta a los demás chats. Solo admin. */
export async function cambiarEstadoBotAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const estado = formData.get("estado") === "HUMANO" ? "HUMANO" : "BOT";
  if (!id) return;
  await setEstadoConversacionPorId(orgId, id, estado);
  revalidatePath(`/panel/bot/${id}`);
  revalidatePath("/panel/bot");
}

/** Guarda el panel de control del bot (modo, llaves y números de prueba). Vale
 *  al instante: cada envío lo vuelve a leer. Solo admin. */
export async function guardarConfigBotAction(formData: FormData) {
  const { organizacionId: orgId } = await requireAdmin();
  const modoRaw = String(formData.get("modo") ?? "");
  const modo: ModoBot =
    modoRaw === "ENCENDIDO" || modoRaw === "PRUEBA" ? modoRaw : "APAGADO";
  const llave = (nombre: string) => formData.get(nombre) === "on";
  await guardarConfigBot(orgId, {
    modo,
    responder: llave("responder"),
    recordatorios: llave("recordatorios"),
    post_clase: llave("post_clase"),
    agenda_profes: llave("agenda_profes"),
    numerosPrueba: String(formData.get("numeros_prueba") ?? ""),
    enlaceClase: String(formData.get("enlace_clase") ?? ""),
  });
  revalidatePath("/panel/bot");
}

export type ResultadoRespuesta = {
  ok: boolean;
  /** Mensaje para mostrarle a la directora: error si ok=false, aviso si ok=true. */
  mensaje?: string;
};

const MAX_CARACTERES = 4000;

/**
 * Manda un mensaje escrito a mano por la directora al WhatsApp del alumno, y lo
 * guarda en el historial marcado como HUMANO.
 *
 * Dos cosas que NO son opcionales acá:
 *
 *  - La ventana de 24 h. WhatsApp solo deja mandar texto libre dentro de las 24
 *    horas posteriores al último mensaje del alumno. Fuera de eso el envío falla
 *    del lado de Meta, así que lo cortamos antes y se lo explicamos.
 *  - Guardar solo si salió. Si guardáramos igual, el panel mostraría un mensaje
 *    que la alumna nunca recibió, y el bot lo leería como dicho al retomar.
 */
export async function responderComoHumanoAction(
  _anterior: ResultadoRespuesta | null,
  formData: FormData,
): Promise<ResultadoRespuesta> {
  const { organizacionId: orgId } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();

  if (!id) return { ok: false, mensaje: "Falta la conversación." };
  if (!texto) return { ok: false, mensaje: "Escribí algo antes de enviar." };
  if (texto.length > MAX_CARACTERES) {
    return {
      ok: false,
      mensaje: `El mensaje es muy largo (${texto.length} caracteres, el máximo es ${MAX_CARACTERES}).`,
    };
  }

  const conv = await getConversacionBotDetalle(orgId, id);
  if (!conv) return { ok: false, mensaje: "No encontré esa conversación." };

  if (!conv.ventanaAbierta) {
    return {
      ok: false,
      mensaje:
        "Pasaron más de 24 horas desde el último mensaje del alumno. WhatsApp no " +
        "permite escribirle texto libre hasta que él vuelva a escribir.",
    };
  }

  // Lo escribe la directora a mano: sale aunque el bot esté pausado.
  const envio = await enviarWhatsApp(orgId, conv.contacto, texto, { manual: true });

  if (!envio.enviado && envio.motivo === "error") {
    return {
      ok: false,
      mensaje: `WhatsApp rechazó el mensaje: ${envio.detalle ?? "sin detalle"}`,
    };
  }

  await guardarMensaje(orgId, id, "assistant", texto, "HUMANO");
  revalidatePath(`/panel/bot/${id}`);
  revalidatePath("/panel/bot");

  if (!envio.enviado && envio.motivo === "no_configurado") {
    return {
      ok: true,
      mensaje:
        "Guardado en el historial, pero WhatsApp todavía no está conectado: el " +
        "mensaje no le llegó al alumno.",
    };
  }

  return { ok: true };
}

export type SaldoFormState = { error?: string; ok?: string } | undefined;

/** Registra una carga de saldo hecha en Claude, para calcular cuánto queda. */
export async function registrarCargaSaldoAction(
  _prev: SaldoFormState,
  formData: FormData,
): Promise<SaldoFormState> {
  const { organizacionId: orgId } = await requireAdmin();
  const monto = Number(String(formData.get("monto") ?? "").replace(",", "."));
  try {
    await registrarCargaSaldo(orgId, monto, String(formData.get("nota") ?? "").trim());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar." };
  }
  revalidatePath("/panel/bot");
  return { ok: `Anotada la carga de USD ${monto.toFixed(2)}.` };
}
