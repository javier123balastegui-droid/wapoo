import type { NextRequest } from "next/server";
import { enviarRecordatoriosDeClase } from "@/lib/bot/recordatorios";
import { enviarResumenDiario } from "@/lib/resumen-diario";
import { enviarConsultasPostClase } from "@/lib/bot/post-clase";
import { avisarSiFaltaSaldo } from "@/lib/bot/uso";
import { paraCadaAcademia } from "@/lib/organizacion";

const detalleDe = (r: PromiseSettledResult<unknown>) =>
  r.status === "fulfilled"
    ? r.value
    : { error: r.reason instanceof Error ? r.reason.message : "Error desconocido" };

/**
 * Cron diario: lo llama Vercel una vez por día (ver vercel.json) y hace dos
 * cosas independientes:
 *
 *   1. Recordatorios por WhatsApp a los ALUMNOS con clase HOY (el aviso de
 *      la noche anterior lo manda /api/cron/recordatorios-noche).
 *   2. Resumen del día al EQUIPO por notificación push (clases de hoy + plata
 *      que falta cobrar).
 *   3. Consulta de "¿cómo te fue?" a los alumnos cuya clase ya terminó y
 *      todavía no se preguntó (típicamente, las clases de anoche).
 *
 * Si una falla, la otra igual se hace: no queremos perder el resumen porque el
 * envío de WhatsApp esté caído (o al revés).
 *
 * Protegido con CRON_SECRET: Vercel Cron manda el header
 * `Authorization: Bearer <CRON_SECRET>` automáticamente. Si el secreto no está
 * configurado o no coincide, se rechaza (para que nadie más lo dispare).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  // Para cada academia activa, las cuatro tareas, independientes entre sí:
  // si una falla (en una academia o en todas), las otras igual se hacen.
  const porAcademia = await paraCadaAcademia("cron", async (orgId) => {
    const [recordatorios, resumen, postClase, saldo] = await Promise.allSettled([
      enviarRecordatoriosDeClase(orgId, "HOY"),
      enviarResumenDiario(orgId),
      enviarConsultasPostClase(orgId),
      // Aviso de saldo bajo del bot (una vez por día, si queda una semana o menos).
      avisarSiFaltaSaldo(orgId),
    ]);
    if (recordatorios.status === "rejected")
      console.error("[cron] recordatorios falló:", recordatorios.reason);
    if (resumen.status === "rejected")
      console.error("[cron] resumen diario falló:", resumen.reason);
    if (postClase.status === "rejected")
      console.error("[cron] consulta post clase falló:", postClase.reason);
    if (saldo.status === "rejected")
      console.error("[cron] aviso de saldo del bot falló:", saldo.reason);
    return {
      ok:
        recordatorios.status === "fulfilled" ||
        resumen.status === "fulfilled" ||
        postClase.status === "fulfilled",
      recordatorios: detalleDe(recordatorios),
      resumenEquipo: detalleDe(resumen),
      postClase: detalleDe(postClase),
      avisoSaldoBot: detalleDe(saldo),
    };
  });

  return Response.json({ porAcademia });
}

