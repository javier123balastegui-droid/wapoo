import type { NextRequest } from "next/server";
import { enviarRecordatoriosDeClase } from "@/lib/bot/recordatorios";
import { enviarConsultasPostClase } from "@/lib/bot/post-clase";
import { paraCadaAcademia } from "@/lib/organizacion";

const detalleDe = (r: PromiseSettledResult<unknown>) =>
  r.status === "fulfilled"
    ? r.value
    : { error: r.reason instanceof Error ? r.reason.message : "Error desconocido" };

/**
 * Cron de la noche (20 hs arg). Hace dos cosas:
 *
 *   1. Recordatorio por WhatsApp a los alumnos que tienen clase MAÑANA.
 *   2. Consulta de "¿cómo te fue?" a los que tuvieron clase hoy y ya terminó.
 *
 * Si una falla, la otra igual se hace.
 *
 * El hermano de este cron es /api/cron/recordatorios, que corre a la mañana
 * (9 hs) y recuerda las clases de ese mismo día, además de mandarle el resumen
 * diario al equipo.
 *
 * Protegido con el mismo CRON_SECRET: Vercel Cron manda el header
 * `Authorization: Bearer <CRON_SECRET>` automáticamente. Si el secreto no está
 * configurado o no coincide, se rechaza (para que nadie más lo dispare).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const porAcademia = await paraCadaAcademia("cron noche", async (orgId) => {
    const [recordatorios, postClase] = await Promise.allSettled([
      enviarRecordatoriosDeClase(orgId, "PREVIO"),
      enviarConsultasPostClase(orgId),
    ]);
    if (recordatorios.status === "rejected")
      console.error("[cron noche] recordatorios falló:", recordatorios.reason);
    if (postClase.status === "rejected")
      console.error("[cron noche] consulta post clase falló:", postClase.reason);
    return {
      ok: recordatorios.status === "fulfilled" || postClase.status === "fulfilled",
      recordatorios: detalleDe(recordatorios),
      postClase: detalleDe(postClase),
    };
  });

  return Response.json({ porAcademia });
}
