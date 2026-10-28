import type { NextRequest } from "next/server";
import { dbDeOrg } from "@/lib/supabase/org";
import { orgPorDefecto } from "@/lib/organizacion";
import { numeroDeOrg } from "@/lib/bot/numeros";

/**
 * Diagnóstico de rendimiento, medido DESDE el servidor.
 *
 * Existe porque medir desde una casa en Argentina no sirve para decidir nada:
 * la latencia de acá se suma a cada consulta y hace parecer lentísimo algo que
 * desde Vercel puede ser instantáneo. Lo que importa es cuánto tarda la base
 * vista desde la función, y en qué región corre cada cosa.
 *
 * Es de solo lectura: no escribe ni borra nada. Igual va protegido con
 * CRON_SECRET, porque cuenta cómo está armado el sistema por dentro.
 *
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://…/api/diagnostico
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ahora = () => performance.now();

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }

  // Mide con los datos de la academia por defecto (provisorio, como los crons).
  const db = dbDeOrg(await orgPorDefecto());
  if (!db) return Response.json({ error: "Sin SUPABASE_SERVICE_ROLE_KEY" });

  // 1) Latencia de una consulta trivial, varias veces: la mediana es lo que
  //    cuesta "ir y volver" a la base desde esta función.
  const sueltas: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = ahora();
    await db.from("alumnos").select("id").limit(1);
    sueltas.push(Math.round(ahora() - t));
  }
  const ordenadas = [...sueltas].sort((a, b) => a - b);
  const latencia = ordenadas[Math.floor(ordenadas.length / 2)];

  // 2) El patrón de la agenda de una semana, de las dos formas, para saber
  //    cuánto se gana de verdad juntando las consultas.
  // TODAS las clases: es el alcance real de la agenda, que no filtra por fecha
  // antes de armar los eventos.
  const tBase = ahora();
  const { data: clases } = await db.from("clases").select("*");
  const ids = (clases ?? []).map((c) => c.id);
  const { data: enlaces } = await db
    .from("clase_alumnos")
    .select("clase_id, alumno_id")
    .in("clase_id", ids);
  const msBase = Math.round(ahora() - tBase);

  // Como lo hace hoy la agenda: una consulta por tema, profe, alumno y pago.
  const tComoEsta = ahora();
  let consultas = 0;
  await Promise.all(
    (clases ?? []).map(async (c) => {
      const mios = (enlaces ?? []).filter((e) => e.clase_id === c.id);
      // PromiseLike: lo que devuelve Supabase es "thenable", no un Promise.
      const pedidos: PromiseLike<unknown>[] = [];
      if (c.tema_id) {
        consultas++;
        pedidos.push(db.from("temas").select("*").eq("id", c.tema_id).maybeSingle());
      }
      if (c.profe_id) {
        consultas++;
        pedidos.push(
          db.from("profiles").select("*").eq("id", c.profe_id).maybeSingle(),
        );
      }
      for (const e of mios) {
        consultas += 2;
        pedidos.push(
          db.from("alumnos").select("*").eq("id", e.alumno_id).maybeSingle(),
          db
            .from("pagos")
            .select("*")
            .eq("clase_id", c.id)
            .eq("alumno_id", e.alumno_id)
            .maybeSingle(),
        );
      }
      await Promise.all(pedidos);
    }),
  );
  const msComoEsta = Math.round(ahora() - tComoEsta);

  // Juntando: una consulta por tabla.
  const tJuntas = ahora();
  await Promise.all([
    db.from("temas").select("*"),
    db.from("profiles").select("*"),
    db.from("alumnos").select("*"),
    db.from("pagos").select("*").in("clase_id", ids),
  ]);
  const msJuntas = Math.round(ahora() - tJuntas);

  // 3) El número de WhatsApp de la academia: si falta, el webhook ignora sus
  //    mensajes. Nunca muestra el token.
  const numero = await numeroDeOrg(db.orgId);
  const whatsapp = numero
    ? {
        registrado: true,
        phoneNumberId: `…${numero.phoneNumberId.slice(-4)}`,
        tokenPropio: numero.token !== process.env.WHATSAPP_TOKEN,
        conSecretoDeApp: Boolean(numero.appSecret),
      }
    : { registrado: false };

  return Response.json({
    whatsapp,
    donde: {
      regionDeLaFuncion: process.env.VERCEL_REGION ?? "(desconocida)",
      entorno: process.env.VERCEL_ENV ?? "(local)",
    },
    latenciaALaBase: {
      medicionesMs: sueltas,
      medianaMs: latencia,
      lectura:
        latencia <= 25
          ? "La base está al lado de la función: la región ya está bien."
          : latencia <= 80
            ? "Hay algo de distancia, pero es tolerable."
            : "La base está LEJOS de la función: conviene igualar las regiones.",
    },
    agendaCompleta: {
      clases: (clases ?? []).length,
      inscripciones: (enlaces ?? []).length,
      traerClasesMs: msBase,
      comoEstaHoy: { consultas, ms: msComoEsta },
      juntandoPorTabla: { consultas: 4, ms: msJuntas },
      cuantoSeGanaMs: msComoEsta - msJuntas,
    },
  });
}
