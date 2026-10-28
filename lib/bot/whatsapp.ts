import "server-only";
import { puedeEnviar, type TipoEnvio } from "@/lib/bot/config";
import { numeroDeOrg } from "@/lib/bot/numeros";

/**
 * Envío de mensajes por WhatsApp (Cloud API de Meta).
 *
 * Cada academia manda desde su número (lib/bot/numeros.ts). Si la academia no
 * tiene número cargado, o si está el modo en seco, NO manda nada real: solo lo
 * registra en el log. Así todo el flujo se puede probar en seco.
 *
 * Es la ÚNICA parte atada a Meta. Si algún día se cambia a otro proveedor
 * (ej: Twilio), solo se toca este archivo; el resto del bot queda igual.
 */

// v21 vence en octubre de 2026 (Meta mantiene cada versión unos dos años).
// v25 es la que usa hoy el panel de Meta y la que trae "escribiendo…".
const VERSION_API = "v25.0";

// Idioma de las plantillas. TIENE que coincidir con el que se elige al crear la
// plantilla en Meta (si allá la creás como "es", cambiá esto a "es").
export const IDIOMA_PLANTILLA = "es_AR";

// Nombres de las plantillas de WhatsApp (mensajes que el bot INICIA y que Meta
// exige aprobar). Estos nombres tienen que coincidir con los que crees en Meta.
export const PLANTILLAS = {
  RECORDATORIO_CLASE: "recordatorio_clase",
  AVISO_PROFE: "aviso_profe_agenda",
  CONSULTA_GRUPAL: "consulta_reagenda_grupal",
  POST_CLASE: "consulta_post_clase",
} as const;

/** Qué llave del panel de control habilita cada plantilla (ver config.ts). */
const LLAVE_DE_PLANTILLA: Record<string, TipoEnvio> = {
  [PLANTILLAS.RECORDATORIO_CLASE]: "recordatorios",
  [PLANTILLAS.POST_CLASE]: "post_clase",
  [PLANTILLAS.AVISO_PROFE]: "agenda_profes",
  [PLANTILLAS.CONSULTA_GRUPAL]: "responder",
};

function urlMensajes(phoneNumberId: string): string {
  return `https://graph.facebook.com/${VERSION_API}/${phoneNumberId}/messages`;
}

/** WhatsApp no acepta mensajes de más de 4096 caracteres; dejamos margen. */
const MAX_POR_MENSAJE = 3500;

/**
 * Cada respuesta sale en UN mensaje, con sus párrafos adentro. Antes se
 * mandaba un mensaje por párrafo, todos en el mismo segundo, y al alumno le
 * llegaba una ráfaga de 5 o 6 mensajes. Solo si la respuesta no entra en un
 * mensaje de WhatsApp se parte, por párrafos (y, si un párrafo solo ya es
 * enorme, por oraciones).
 */
export function partirEnMensajes(texto: string): string[] {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length <= MAX_POR_MENSAJE ? [p] : partirParrafo(p)));

  const partes: string[] = [];
  let actual = "";
  for (const p of parrafos) {
    const junto = actual ? `${actual}\n\n${p}` : p;
    if (junto.length > MAX_POR_MENSAJE) {
      partes.push(actual);
      actual = p;
    } else {
      actual = junto;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

/** Un párrafo que solo ya no entra en un mensaje: se corta entre oraciones. */
function partirParrafo(parrafo: string): string[] {
  const oraciones = parrafo.match(/[^.!?\n]+[.!?]*\s*/g) ?? [parrafo];
  const partes: string[] = [];
  let actual = "";
  for (const o of oraciones) {
    if ((actual + o).length > MAX_POR_MENSAJE && actual) {
      partes.push(actual.trim());
      actual = "";
    }
    actual += o;
  }
  if (actual.trim()) partes.push(actual.trim());
  // Una "oración" de más de 3500 caracteres sin puntos: corte duro.
  return partes.flatMap((p) =>
    p.length <= MAX_POR_MENSAJE
      ? [p]
      : (p.match(new RegExp(`[\\s\\S]{1,${MAX_POR_MENSAJE}}`, "g")) ?? [p]),
  );
}

export type EnvioResultado =
  | { enviado: true }
  | { enviado: false; motivo: "no_configurado" | "error"; detalle?: string };

/** Manda un mensaje de texto a un número de WhatsApp. `manual`: lo escribió
 *  la directora desde el panel, y sale siempre; todo lo demás lo decide el
 *  panel de control del bot (llave "responder"). */
export async function enviarWhatsApp(
  orgId: string,
  telefono: string,
  texto: string,
  { manual = false }: { manual?: boolean } = {},
): Promise<EnvioResultado> {
  const numero = await numeroDeOrg(orgId);
  if (!numero) {
    console.log(
      `[whatsapp] (sin número o en seco — no se envía) → ${telefono}: ${texto}`,
    );
    return { enviado: false, motivo: "no_configurado" };
  }
  if (!manual && !(await puedeEnviar(orgId, "responder", telefono))) {
    console.log(`[whatsapp] (apagado en el panel — no se envía) → ${telefono}`);
    return { enviado: false, motivo: "no_configurado", detalle: "apagado en el panel" };
  }

  try {
    const res = await fetch(urlMensajes(numero.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${numero.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { body: texto },
      }),
    });
    if (!res.ok) {
      const detalle = await res.text();
      console.error(`[whatsapp] error ${res.status} al enviar:`, detalle);
      return { enviado: false, motivo: "error", detalle };
    }
    return { enviado: true };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[whatsapp] excepción al enviar:", detalle);
    return { enviado: false, motivo: "error", detalle };
  }
}

/**
 * Manda un mensaje de PLANTILLA (los que el bot inicia: recordatorios, aviso al
 * profe, consulta al grupo). Estos exigen una plantilla aprobada en Meta.
 * `parametros` rellena los {{1}}, {{2}}, … del cuerpo, en orden.
 */
export async function enviarPlantilla(
  orgId: string,
  telefono: string,
  nombrePlantilla: string,
  parametros: string[],
): Promise<EnvioResultado> {
  const numero = await numeroDeOrg(orgId);
  if (!numero) {
    console.log(
      `[whatsapp plantilla] (sin número o en seco — no se envía) → ${telefono}: ${nombrePlantilla} [ ${parametros.join(" | ")} ]`,
    );
    return { enviado: false, motivo: "no_configurado" };
  }
  // Cada plantilla sale solo si su llave está prendida en el panel. Una
  // plantilla sin llave asignada no sale nunca.
  const llave = LLAVE_DE_PLANTILLA[nombrePlantilla];
  if (!llave || !(await puedeEnviar(orgId, llave, telefono))) {
    console.log(`[whatsapp plantilla] (apagado en el panel — no se envía) → ${telefono}: ${nombrePlantilla}`);
    return { enviado: false, motivo: "no_configurado", detalle: "apagado en el panel" };
  }

  try {
    const res = await fetch(urlMensajes(numero.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${numero.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: nombrePlantilla,
          language: { code: IDIOMA_PLANTILLA },
          components: parametros.length
            ? [
                {
                  type: "body",
                  parameters: parametros.map((t) => ({ type: "text", text: t })),
                },
              ]
            : [],
        },
      }),
    });
    if (!res.ok) {
      const detalle = await res.text();
      console.error(`[whatsapp plantilla] error ${res.status}:`, detalle);
      return { enviado: false, motivo: "error", detalle };
    }
    return { enviado: true };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[whatsapp plantilla] excepción:", detalle);
    return { enviado: false, motivo: "error", detalle };
  }
}

/** Pausa entre partes, cuando una respuesta no entra en un solo mensaje. */
const PAUSA_ENTRE_PARTES_MS = 3_000;

/**
 * Manda la respuesta del bot: normalmente un solo mensaje. Si hubo que
 * partirla, entre una parte y otra muestra "escribiendo…" y espera unos
 * segundos, como haría una persona, en vez de soltarlas todas juntas.
 * `wamid`: el mensaje del alumno, para el "escribiendo…".
 */
export async function enviarRespuesta(
  orgId: string,
  telefono: string,
  respuesta: string,
  wamid?: string,
): Promise<void> {
  const partes = partirEnMensajes(respuesta);
  for (let i = 0; i < partes.length; i++) {
    if (i > 0) {
      if (wamid) await indicarEscribiendo(orgId, wamid);
      await new Promise((r) => setTimeout(r, PAUSA_ENTRE_PARTES_MS));
    }
    // Cada parte pasa por enviarWhatsApp, que respeta el panel de control.
    const envio = await enviarWhatsApp(orgId, telefono, partes[i]);
    if (!envio.enviado) return; // apagado o error: no sigas con el resto
  }
}

export type MediaDescargada = { bytes: ArrayBuffer; mime: string };

/**
 * Descarga un archivo que mandó un alumno (foto o PDF). El webhook de WhatsApp
 * no trae el archivo, solo un id: primero se le pide a Meta la URL y después se
 * baja con el mismo token. Esa URL vence a los pocos minutos, así que se baja en
 * el momento. Devuelve null si no hay credenciales o si Meta falla.
 */
export async function descargarMedia(
  orgId: string,
  mediaId: string,
): Promise<MediaDescargada | null> {
  // El archivo se pide con el token del número que lo recibió.
  const numero = await numeroDeOrg(orgId);
  if (!numero) return null;
  const auth = { Authorization: `Bearer ${numero.token}` };
  try {
    const info = await fetch(
      `https://graph.facebook.com/${VERSION_API}/${mediaId}`,
      { headers: auth },
    );
    if (!info.ok) {
      console.error(
        `[whatsapp] error ${info.status} al pedir el archivo ${mediaId}:`,
        await info.text(),
      );
      return null;
    }
    const { url, mime_type } = (await info.json()) as {
      url?: string;
      mime_type?: string;
    };
    if (!url) return null;

    const archivo = await fetch(url, { headers: auth });
    if (!archivo.ok) {
      console.error(
        `[whatsapp] error ${archivo.status} al bajar el archivo ${mediaId}`,
      );
      return null;
    }
    return {
      bytes: await archivo.arrayBuffer(),
      mime:
        mime_type ??
        archivo.headers.get("content-type") ??
        "application/octet-stream",
    };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error(`[whatsapp] excepción al bajar el archivo ${mediaId}:`, detalle);
    return null;
  }
}

/**
 * Marca el mensaje del alumno como leído (tildes azules) y muestra
 * "escribiendo…" mientras el bot arma la respuesta. WhatsApp lo apaga solo
 * cuando llega la respuesta o a los 25 segundos. Es cosmético: nunca tira
 * error ni frena el procesamiento.
 */
// Solo se llama cuando el bot va a contestar (procesar.ts ya chequeó el panel).
export async function indicarEscribiendo(orgId: string, wamid: string): Promise<void> {
  const numero = await numeroDeOrg(orgId);
  if (!numero) return;
  try {
    const res = await fetch(urlMensajes(numero.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${numero.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: wamid,
        typing_indicator: { type: "text" },
      }),
    });
    if (!res.ok) {
      console.error(
        `[whatsapp] error ${res.status} al marcar "escribiendo":`,
        await res.text(),
      );
    }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error('[whatsapp] excepción al marcar "escribiendo":', detalle);
  }
}
