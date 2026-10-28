import "server-only";
import {
  getOrCreateConversacion,
  getMensajes,
  guardarMensaje,
  esElUltimoDelAlumno,
} from "@/lib/bot/conversaciones";
import { generarRespuestaBot, conMensajeDelLink } from "@/lib/bot/cliente";
import { notificarAdmins } from "@/lib/push";
import { guardarAdjuntoWhatsApp, type Adjunto } from "@/lib/bot/comprobantes";
import { indicarEscribiendo } from "@/lib/bot/whatsapp";
import { puedeEnviar, getConfigBot } from "@/lib/bot/config";

/**
 * Por WhatsApp la gente escribe en varios mensajes seguidos ("hola" / "quería
 * consultar" / "cuánto sale?"). Antes de contestar esperamos un rato: si en el
 * medio llega otro mensaje, contesta ese, leyendo todo junto, en vez de mandar
 * una respuesta por cada uno.
 *
 * Después de un saludo casi siempre viene la pregunta de verdad, así que ahí
 * esperamos más. Un "dale" o un "sí" en medio de una charla NO cuentan como
 * saludo: son respuestas, y demorarlas haría lento el agendado.
 */
const ESPERA_TRAS_SALUDO_MS = 20_000;
const ESPERA_TRAS_MENSAJE_MS = 10_000;

const PALABRAS_DE_ARRANQUE = new Set([
  "hola", "holis", "buenas", "buen", "buenos", "dia", "dias",
  "tardes", "noches", "que", "tal", "como", "estas", "andas", "va", "hey",
  "ey", "un", "una", "consulta", "consultita", "consultar", "queria",
  "quisiera", "hacer", "te", "hago", "tengo", "duda", "pregunta", "disculpa",
  "disculpe", "perdon", "info", "informacion",
]);

/** ¿Es solo un saludo o una frase de arranque ("hola, buenas", "una consulta")? */
function esSaludoOArranque(texto: string): boolean {
  const palabras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin tildes
    .replace(/[^a-z0-9\s]/g, " ") // sin signos ni emojis
    .replace(/([a-z])\1+/g, "$1") // "holaaa" → "hola", "buenaaas" → "buenas"
    .split(/\s+/)
    .filter(Boolean);
  // Solo emojis (un 👋) también es un saludo.
  return palabras.every((p) => PALABRAS_DE_ARRANQUE.has(p));
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResultadoProceso = {
  /** Respuesta del bot (vacía si la conversación está en modo humano). */
  respuesta: string;
  /** true si la conversación está en manos de una persona (el bot no responde). */
  enModoHumano: boolean;
};

/**
 * Deja el texto del bot como se escribe en WhatsApp. El system prompt ya lo
 * pide, pero los modelos a veces se escapan, así que acá se garantiza. Solo se
 * aplica a lo que redacta el bot, nunca a la directora.
 *
 *  - Sin ¿ ni ¡: por WhatsApp se escribe "cómo estás?". En castellano solo
 *    abren, así que sacarlos no toca los de cierre.
 *  - Negritas de WhatsApp: *así*. El modelo escribe **así** (Markdown), y
 *    WhatsApp mostraría los asteriscos de más.
 *  - Sin títulos de Markdown ("## Tema"): WhatsApp los muestra tal cual.
 *  - Sin el registro interno de acciones ni las anotaciones de mensajes
 *    automáticos, si alguna vez las copia.
 */
function paraWhatsApp(texto: string): string {
  return texto
    .replace(/[¿¡]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[Registro interno[^\]]*\]/g, "")
    .replace(/\[Mensaje automático[^\]]*\]/g, "")
    .replace(/\[Este mensaje llegó[^\]]*\]/g, "")
    .trim();
}

/**
 * Procesa un mensaje entrante de un contacto: guarda el mensaje, y —si la
 * conversación está en modo BOT— genera y guarda la respuesta. Si está en modo
 * HUMANO, guarda el mensaje pero NO responde (la directora está atendiendo).
 *
 * Si el alumno mandó un archivo (`mediaId`: foto o PDF, normalmente un
 * comprobante), se guarda en el depósito privado pegado a su mensaje, para que
 * la dirección lo pueda revisar desde el panel.
 *
 * Lo usan tanto el endpoint de prueba (/api/bot) como el webhook de WhatsApp.
 */
export async function procesarMensajeEntrante(
  orgId: string,
  contacto: string,
  mensaje: string,
  opciones: {
    /** Archivo adjunto de WhatsApp (foto o PDF). */
    mediaId?: string;
    /** Id del mensaje de WhatsApp, para marcarlo leído y mostrar "escribiendo…". */
    wamid?: string;
    /** Esperar y contestar una sola vez si el alumno manda varios mensajes seguidos. */
    agrupar?: boolean;
    /** Quien llama no manda la respuesta por WhatsApp (batería de pruebas),
     *  así que no depende del panel de control. */
    sinWhatsApp?: boolean;
  } = {},
): Promise<ResultadoProceso> {
  const conversacion = await getOrCreateConversacion(orgId, contacto);

  let adjunto: Adjunto | null = null;
  if (opciones.mediaId) {
    adjunto = await guardarAdjuntoWhatsApp(orgId, conversacion.id, opciones.mediaId);
    if (!adjunto) {
      // Que no pase desapercibido: lo lee el bot y lo ve la dirección.
      mensaje +=
        " [El archivo no se pudo guardar. Si es un comprobante, pedile que lo reenvíe.]";
    }
  }

  const mensajeId = await guardarMensaje(
    orgId,
    conversacion.id,
    "user",
    mensaje,
    "BOT",
    adjunto,
  );

  // Si el panel de control no deja que el bot le conteste a este número
  // (apagado, o en prueba y no es un número de prueba), se trata como en modo
  // humano: queda en el panel, le avisa a la dirección y nadie contesta solo.
  const botPuedeContestar =
    opciones.sinWhatsApp || (await puedeEnviar(orgId, "responder", contacto));
  if (conversacion.estado === "HUMANO" || !botPuedeContestar) {
    // Nadie va a contestar si nadie se entera: en modo humano el bot se calla,
    // así que le avisamos a la DIRECCIÓN al celular. Solo a la dirección: el
    // texto de una notificación se lee en la pantalla de bloqueo, y las charlas
    // con las alumnas no son para los profes. Nunca tira error, así que no
    // puede romper la recepción del mensaje.
    await notificarAdmins(orgId, {
      titulo: `Mensaje de ${conversacion.contacto}`,
      cuerpo: mensaje.length > 120 ? `${mensaje.slice(0, 119)}…` : mensaje,
      url: `/panel/bot/${conversacion.id}`,
    });
    return { respuesta: "", enModoHumano: true };
  }

  // Tildes azules y "escribiendo…" solo si contesta el bot: en modo humano
  // sería mentirle a la alumna que alguien está leyendo.
  if (opciones.wamid) await indicarEscribiendo(orgId, opciones.wamid);

  // El aviso de comprobante lo manda el bot (herramienta avisar_comprobante)
  // después de mirar el archivo: así una foto cualquiera no dispara un aviso.

  if (opciones.agrupar) {
    await esperar(
      esSaludoOArranque(mensaje) ? ESPERA_TRAS_SALUDO_MS : ESPERA_TRAS_MENSAJE_MS,
    );
    // Si mandó otro mensaje mientras esperábamos, contesta ese (con todo junto).
    if (!(await esElUltimoDelAlumno(orgId, conversacion.id, mensajeId))) {
      return { respuesta: "", enModoHumano: false };
    }
    // Y si en el medio la directora tomó el control, el bot ya no contesta.
    const actual = await getOrCreateConversacion(orgId, contacto);
    if (actual.estado === "HUMANO") return { respuesta: "", enModoHumano: true };
  }

  const historial = await getMensajes(orgId, conversacion.id);
  const { texto, acciones } = await generarRespuestaBot(orgId, historial, conversacion.contacto);
  // Primero se limpia lo que redactó el bot, y recién después se pega el
  // mensaje con el link: es un texto fijo de la academia y tiene que salir tal
  // cual, con sus "¡¡¡" y sus emojis, sin pasar por el limpiado.
  const respuesta = conMensajeDelLink(
    paraWhatsApp(texto),
    (await getConfigBot(orgId)).enlaceClase,
  );
  await guardarMensaje(orgId, conversacion.id, "assistant", respuesta, "BOT", null, acciones);

  return { respuesta, enModoHumano: false };
}
