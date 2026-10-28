import type { NextRequest } from "next/server";
import { procesarMensajeEntrante } from "@/lib/bot/procesar";
import { getCurrentUser } from "@/lib/auth";

/**
 * Endpoint de PRUEBA del bot (lo usa la pantalla /bot-test).
 *
 * Recibe { contacto, mensaje }, procesa el mensaje con la misma lógica que
 * usará el webhook de WhatsApp real (ver app/api/whatsapp/route.ts) y devuelve
 * el texto de la respuesta. La diferencia con el webhook es que acá NO se manda
 * nada por WhatsApp: se devuelve el texto para mostrarlo en la pantalla.
 *
 * SOLO PARA EL EQUIPO: cada llamada consume API de Claude (se paga), así que
 * exige sesión iniciada. Sin sesión corta con 401 ANTES de llamar al modelo.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Necesitás iniciar sesión para probar el bot." },
      { status: 401 },
    );
  }

  let body: { contacto?: unknown; mensaje?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido (se espera JSON)." }, { status: 400 });
  }

  const contacto = String(body.contacto ?? "").trim();
  const mensaje = String(body.mensaje ?? "").trim();

  if (!contacto) {
    return Response.json({ error: "Falta 'contacto'." }, { status: 400 });
  }
  if (!mensaje) {
    return Response.json({ error: "Falta 'mensaje'." }, { status: 400 });
  }

  try {
    const { respuesta, enModoHumano } = await procesarMensajeEntrante(
      user.organizacionId,
      contacto,
      mensaje,
    );
    if (enModoHumano) {
      return Response.json({
        respuesta:
          "(Esta conversación está en modo humano — el bot no responde; la está atendiendo la directora.)",
        enModoHumano: true,
      });
    }
    return Response.json({ respuesta, enModoHumano: false });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[bot] error al procesar el mensaje:", detalle);
    return Response.json(
      { error: "No se pudo procesar el mensaje.", detalle },
      { status: 500 },
    );
  }
}
