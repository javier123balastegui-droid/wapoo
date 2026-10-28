import type { NextRequest } from "next/server";
import { enviarConsultasPostClase } from "@/lib/bot/post-clase";
import { paraCadaAcademia } from "@/lib/organizacion";

/**
 * Consulta de "¿cómo te fue?" a los alumnos cuya clase ya terminó.
 *
 * Existe como endpoint aparte para poder llamarlo SEGUIDO (cada 10-15 minutos)
 * y que el mensaje salga apenas termina la clase, en vez de esperar al cron
 * diario. Es seguro llamarlo muchas veces: cada clase se marca al preguntarse,
 * así que nunca manda dos veces lo mismo.
 *
 * Quién lo llama:
 *   - Vercel Cron, si algún día se pasa a plan Pro (permite cada minuto).
 *   - O un programador externo gratuito (cron-job.org y similares), mandando
 *     el header `Authorization: Bearer <CRON_SECRET>`.
 *
 * Los crons diarios de la mañana y la noche también hacen esta tarea, así que
 * aunque el llamador externo se caiga, nadie se queda sin su mensaje.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const postClase = await paraCadaAcademia("cron post-clase", (orgId) =>
      enviarConsultasPostClase(orgId),
    );
    return Response.json({ ok: true, postClase });
  } catch (e) {
    // Solo llega acá si no se pudo ni listar las academias.
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[cron post-clase] falló:", detalle);
    return Response.json({ ok: false, error: detalle }, { status: 500 });
  }
}
