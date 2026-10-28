import { after, type NextRequest } from "next/server";
import crypto from "crypto";
import { procesarMensajeEntrante } from "@/lib/bot/procesar";
import { enviarRespuesta } from "@/lib/bot/whatsapp";
import { esTipoComprobante } from "@/lib/bot/comprobantes";
import { reclamarMensajeEntrante } from "@/lib/bot/conversaciones";
import { notificarAdmins } from "@/lib/push";
import { numeroPorPhoneId } from "@/lib/bot/numeros";

// La respuesta a Meta sale al instante, pero el bot sigue trabajando después
// (espera por si llegan más mensajes, piensa, usa herramientas). Este es el
// tiempo máximo que Vercel lo deja seguir. Una consulta que termina buscando
// en internet tarda cerca de un minuto, más la espera para agrupar mensajes:
// 60 s no alcanzaban. El proyecto usa Fluid Compute, que permite hasta 300.
export const maxDuration = 180;

/**
 * Webhook de WhatsApp (Cloud API de Meta). Es el que hace operativo al bot:
 * recibe los mensajes de los alumnos y responde por WhatsApp.
 *
 *  - GET  → verificación del webhook (Meta lo pega una vez al configurarlo).
 *  - POST → mensajes entrantes. Le contesta "recibido" a Meta enseguida y
 *           procesa después: si tardáramos, Meta cree que no llegó y lo
 *           reenvía. Los reenvíos se descartan por el id del mensaje. Después,
 *           el bot contesta por WhatsApp (salvo en modo humano).
 *
 * Funciona en seco: sin credenciales cargadas, igual procesa y arma la respuesta
 * (solo que el envío queda registrado en el log en vez de salir por WhatsApp).
 * Ver lib/bot/whatsapp.ts.
 */

// — GET: verificación del webhook —
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Verificación fallida", { status: 403 });
}

/**
 * Valida que el aviso venga REALMENTE de Meta, con la firma HMAC que calcula
 * la app de Meta del número con su secreto.
 *
 * Sin secreto no hay forma de comprobar el origen, así que se rechaza (antes
 * se aceptaba, y eso dejaba el bot abierto: cualquiera podía pegarle un POST
 * imitando a Meta y hacer gastar API de Claude).
 *
 * ⚠️ Al conectar WhatsApp hay que cargar el secreto de la app sí o sí
 * (WHATSAPP_APP_SECRET, o el de la academia si usa su propia cuenta), o el
 * webhook va a rechazar todos sus mensajes.
 */
function firmaValida(secret: string, rawBody: string, firmaHeader: string | null): boolean {
  if (!secret || !firmaHeader) return false;
  const esperado =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(firmaHeader),
      Buffer.from(esperado),
    );
  } catch {
    return false;
  }
}

/** Lo que usamos de un mensaje entrante de WhatsApp Cloud API. */
type MensajeWhatsApp = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  document?: { id?: string; caption?: string; mime_type?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

/** El aviso que manda Meta al webhook: entradas, cambios y mensajes. */
type AvisoWhatsApp = {
  entry?: {
    changes?: {
      value?: { metadata?: { phone_number_id?: string }; messages?: MensajeWhatsApp[] };
    }[];
  }[];
};

/** Extrae el texto que le pasamos al bot según el tipo de mensaje de WhatsApp. */
function textoDelMensaje(msg: MensajeWhatsApp): string {
  switch (msg.type) {
    case "text":
      return String(msg.text?.body ?? "").trim();
    case "image": {
      const caption = String(msg.image?.caption ?? "").trim();
      const base = "[El alumno envió una imagen.]";
      return caption ? `${base} Escribió: ${caption}` : base;
    }
    case "document": {
      const caption = String(msg.document?.caption ?? "").trim();
      const base = esTipoComprobante(msg.document?.mime_type)
        ? "[El alumno envió un archivo.]"
        : "[El alumno envió un archivo que no podés abrir. Si hace falta, preguntale qué es.]";
      return caption ? `${base} Escribió: ${caption}` : base;
    }
    // Tocó un botón de un mensaje automático (plantilla) o de una lista.
    case "button":
      return `[El alumno tocó el botón "${String(msg.button?.text ?? "").trim()}" del mensaje automático.]`;
    case "interactive": {
      const titulo =
        msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "";
      return `[El alumno eligió la opción "${String(titulo).trim()}".]`;
    }
    case "audio":
      return "[El alumno envió un audio. Todavía no podés escuchar audios: pedile con amabilidad que te lo escriba.]";
    case "video":
      return "[El alumno envió un video, que no podés ver. Si hace falta, preguntale qué necesita.]";
    case "sticker":
      return "[El alumno envió un sticker.]";
    case "location":
      return "[El alumno compartió una ubicación.]";
    case "contacts":
      return "[El alumno compartió un contacto.]";
    // Una reacción (👍 a un mensaje) no pide respuesta: se ignora.
    case "reaction":
      return "";
  }
  // Nunca le digas "audio" a algo que no lo es: el alumno se confunde.
  return "[El alumno envió un tipo de mensaje que no se puede mostrar. Si hace falta, pedile con amabilidad que lo escriba.]";
}

/** Id del archivo adjunto, si es algo que guardamos como comprobante. */
function mediaDelMensaje(msg: MensajeWhatsApp): string | undefined {
  if (msg.type === "image") return msg.image?.id;
  if (msg.type === "document" && esTipoComprobante(msg.document?.mime_type)) {
    return msg.document?.id;
  }
  return undefined;
}

// — POST: mensajes entrantes —
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const firma = request.headers.get("x-hub-signature-256");

  // Se lee antes de verificar la firma porque el secreto depende del número
  // que recibió el mensaje. Nada de lo que trae se usa hasta verificarla.
  let payload: AvisoWhatsApp;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Body inválido", { status: 400 });
  }

  // Cada "change" del aviso es de un número (metadata.phone_number_id). El
  // número dice de qué academia es el mensaje, y su secreto tiene que validar
  // la firma. Se verifica número por número: si un aviso mezclara números de
  // apps distintas, solo pasan los del secreto que firmó. Así quien tenga su
  // propia app no puede colar un mensaje a nombre de otra academia.
  const mensajes: {
    orgId: string;
    wamid: string;
    from: string;
    texto: string;
    mediaId?: string;
  }[] = [];
  let algunoFirmado = false;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneId = String(change.value?.metadata?.phone_number_id ?? "");
      const numero = await numeroPorPhoneId(phoneId);
      if (!numero) {
        if (phoneId) console.error(`[whatsapp] aviso para un número que no es de ninguna academia: ${phoneId}`);
        continue;
      }
      if (!firmaValida(numero.appSecret, rawBody, firma)) continue;
      algunoFirmado = true;
      for (const msg of change.value?.messages ?? []) {
        if (!msg.from) continue;
        mensajes.push({
          orgId: numero.organizacionId,
          wamid: String(msg.id ?? ""),
          from: msg.from,
          texto: textoDelMensaje(msg),
          mediaId: mediaDelMensaje(msg),
        });
      }
    }
  }
  if (!algunoFirmado) return new Response("Firma inválida", { status: 401 });

  // Descartamos los reenvíos de Meta antes de contestarle: así cada mensaje
  // se procesa una sola vez aunque llegue repetido.
  const nuevos: typeof mensajes = [];
  for (const m of mensajes) {
    if (!m.texto) continue;
    if (!m.wamid || (await reclamarMensajeEntrante(m.orgId, m.wamid))) nuevos.push(m);
  }

  // Todos a la vez: si Meta junta varios mensajes en un mismo aviso, cada uno
  // se guarda enseguida y el agrupado decide cuál contesta. Nunca dejamos que
  // un error se escape: acá ya no hay a quién devolvérselo.
  after(async () => {
    await Promise.all(
      nuevos.map(async ({ orgId, wamid, from, texto, mediaId }) => {
        try {
          const { respuesta, enModoHumano } = await procesarMensajeEntrante(
            orgId,
            from,
            texto,
            { mediaId, wamid: wamid || undefined, agrupar: true },
          );
          if (!enModoHumano && respuesta) {
            await enviarRespuesta(orgId, from, respuesta, wamid || undefined);
          }
        } catch (e) {
          const detalle = e instanceof Error ? e.message : "Error desconocido";
          console.error(`[whatsapp] error procesando mensaje de ${from}:`, detalle);
          // Que el alumno no quede sin respuesta sin que nadie se entere (pasó
          // el día que se acabó el saldo de la API): le avisamos a la
          // dirección para que conteste desde el panel. La charla NO pasa a
          // modo humano: una falla pasajera dejaba al bot callado en esa
          // conversación para siempre, aun con todo funcionando de nuevo.
          try {
            await notificarAdmins(orgId, {
              titulo: "El bot no pudo responder",
              cuerpo: `Le escribieron por WhatsApp (${from}) y el bot falló: ${detalle.slice(0, 80)}`,
              url: "/panel/bot",
            });
          } catch {
            // Si también falla esto, queda el log de arriba.
          }
        }
      }),
    );
  });

  return new Response("OK", { status: 200 });
}
