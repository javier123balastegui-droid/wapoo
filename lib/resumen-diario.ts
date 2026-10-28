import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";
import { notificarAdmins, notificarProfes } from "@/lib/push";
import { precioAlumno } from "@/lib/precios";
import { ahoraEn } from "@/lib/fechas";
import { hhmm } from "@/lib/disponibilidad";
import { montoTexto } from "@/lib/utils";
import { getOrganizacion, monedaDe, zonaDe } from "@/lib/organizacion";

/**
 * Resumen de la mañana para el equipo (dirección y administración).
 *
 * Una notificación por día con las clases de HOY y, si hay, la plata que falta
 * cobrar de clases ya dadas. Lo dispara el cron diario
 * (ver app/api/cron/recordatorios/route.ts).
 *
 * Usa el cliente admin porque el cron corre SIN sesión de usuario: las
 * funciones de `mock-data.ts` (que van con la sesión del admin) no sirven acá.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ResumenDiario {
  clasesHoy: number;
  faltaCobrar: number;
  avisosEnviados: number;
}

/** Clases de hoy, ordenadas por horario, con los nombres de las alumnas. */
async function clasesDeHoy(db: any, hoy: string) {
  const { data: clases } = await db
    .from("clases")
    .select("id, inicio_min, duracion, tipo, tema_id, clase_alumnos(alumno_id)")
    .eq("fecha", hoy)
    .order("inicio_min");
  if (!clases || clases.length === 0) return [];

  const alumnoIds = [
    ...new Set(
      clases.flatMap((c: any) =>
        (c.clase_alumnos ?? []).map((l: any) => l.alumno_id),
      ),
    ),
  ];
  const nombres = new Map<string, string>();
  if (alumnoIds.length > 0) {
    const { data: als } = await db
      .from("alumnos")
      .select("id, nombre")
      .in("id", alumnoIds);
    for (const a of als ?? []) nombres.set(a.id, a.nombre);
  }

  return clases.map((c: any) => ({
    inicioMin: c.inicio_min,
    // Solo el primer nombre: en la notificación no entra más.
    alumnas: (c.clase_alumnos ?? [])
      .map((l: any) => (nombres.get(l.alumno_id) ?? "").split(" ")[0])
      .filter(Boolean),
  }));
}

/** Plata pendiente de clases YA DADAS (mismas reglas que la pantalla
 *  "Falta cobrar": solo cuentan las realizadas o sin marcar). */
async function totalFaltaCobrar(db: any, hoy: string): Promise<number> {
  const [{ data: clases }, { data: precios }] = await Promise.all([
    db
      .from("clases")
      .select(
        "id, tipo, duracion, estado_realizacion, clase_alumnos(alumno_id), pagos(alumno_id, estado, monto)",
      )
      .lt("fecha", hoy),
    db
      .from("precios")
      .select("valor_individual, valor_grupal_2, valor_grupal_3")
      .maybeSingle(),
  ]);
  if (!clases) return 0;

  const p = {
    valorIndividual: Number(precios?.valor_individual ?? 0),
    valorGrupal2: Number(precios?.valor_grupal_2 ?? 0),
    valorGrupal3: Number(precios?.valor_grupal_3 ?? 0),
  };

  let total = 0;
  for (const c of clases) {
    const estado = c.estado_realizacion ?? "PENDIENTE";
    if (estado !== "REALIZADA" && estado !== "PENDIENTE") continue;
    const cuantos = (c.clase_alumnos ?? []).length;
    const precioTotal = precioAlumno(p, c.tipo, cuantos, c.duracion);
    for (const pago of c.pagos ?? []) {
      if (pago.estado === "PAGADO") continue;
      const yaPago = pago.estado === "SENADO" ? Number(pago.monto ?? 0) : 0;
      const falta = precioTotal - yaPago;
      if (falta > 0) total += falta;
    }
  }
  return total;
}

export async function enviarResumenDiario(orgId: string): Promise<ResumenDiario> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const hoy = ahoraEn(await zonaDe(orgId)).fecha;
  const [clases, faltaCobrar] = await Promise.all([
    clasesDeHoy(db, hoy),
    totalFaltaCobrar(db, hoy),
  ]);

  const titulo =
    clases.length === 0
      ? "Hoy no hay clases"
      : `Hoy: ${clases.length} ${clases.length === 1 ? "clase" : "clases"}`;

  // Se listan las primeras; si son muchas, se corta para que entre en el aviso.
  const listado = clases
    .slice(0, 5)
    .map(
      (c: { inicioMin: number; alumnas: string[] }) =>
        `${hhmm(c.inicioMin)}${c.alumnas.length ? ` ${c.alumnas.join(" y ")}` : ""}`,
    )
    .join(" · ");
  const resto = clases.length > 5 ? ` y ${clases.length - 5} más` : "";

  // El resumen sale en dos versiones. A la dirección le va todo; a los profes,
  // solo la agenda del día. La plata que falta cobrar no es asunto suyo, y va
  // en el mismo aviso, así que no alcanza con filtrar quién lo recibe: hay que
  // armar un texto distinto.
  const agenda = clases.length > 0 ? listado + resto : "Día libre, no hay clases.";

  const partesDireccion: string[] = [agenda];
  if (faltaCobrar > 0) {
    partesDireccion.push(`Falta cobrar ${montoTexto(faltaCobrar, monedaDe(await getOrganizacion(orgId)))}.`);
  }

  const [aDireccion, aProfes] = await Promise.all([
    notificarAdmins(orgId, {
      titulo,
      cuerpo: partesDireccion.join(" — "),
      url: clases.length > 0 ? "/panel/agenda" : "/panel/finanzas?tab=pendiente",
    }),
    notificarProfes(orgId, {
      titulo,
      cuerpo: agenda,
      url: "/panel/agenda",
    }),
  ]);

  return {
    clasesHoy: clases.length,
    faltaCobrar,
    avisosEnviados: aDireccion + aProfes,
  };
}
