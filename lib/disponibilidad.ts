import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";
import { getOrganizacion, ventanaDeOrg, zonaDe } from "@/lib/organizacion";
import { parseFecha, ahoraEn } from "@/lib/fechas";

/**
 * Disponibilidad de horarios: la ÚNICA fuente de verdad sobre si una clase
 * choca con otra. La usan el portal del alumno, el panel del admin y el bot,
 * para que los tres digan exactamente lo mismo.
 *
 * Regla: dos clases NO pueden pisarse, sin importar el profe ni el alumno.
 * (La academia tiene un solo profe dando clase a la vez; si algún día hay dos
 * en paralelo, acá es donde habría que empezar a filtrar por profe.)
 *
 * Clases pegadas SÍ se permiten: 15:00-16:00 y 16:00-17:00 no se pisan.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Franja {
  inicioMin: number;
  duracion: number;
}

/** ¿Se pisan dos franjas? Tocarse por el borde NO es pisarse. */
export function solapan(
  aIni: number,
  aDur: number,
  bIni: number,
  bDur: number,
): boolean {
  return aIni < bIni + bDur && bIni < aIni + aDur;
}

export interface ClaseOcupada {
  id: string;
  inicioMin: number;
  duracion: number;
}

/** Todas las clases agendadas ese día (de cualquier profe y alumno). */
export async function clasesDelDia(orgId: string, fecha: string): Promise<ClaseOcupada[]> {
  const db = dbDeOrg(orgId);
  if (!db) return [];
  const { data } = await db
    .from("clases")
    .select("id, inicio_min, duracion")
    .eq("fecha", fecha);
  return (data ?? []).map((c: any) => ({
    id: c.id,
    inicioMin: c.inicio_min,
    duracion: c.duracion,
  }));
}

/**
 * ¿El horario pedido choca con una clase ya agendada?
 * Devuelve la clase que estorba, o null si está libre.
 * `excluirClaseId` sirve al editar/reagendar: la clase que se mueve no choca
 * consigo misma.
 */
export async function buscarChoque(
  orgId: string,
  fecha: string,
  inicioMin: number,
  duracion: number,
  excluirClaseId?: string,
): Promise<ClaseOcupada | null> {
  const ocupadas = await clasesDelDia(orgId, fecha);
  for (const c of ocupadas) {
    if (excluirClaseId && c.id === excluirClaseId) continue;
    if (solapan(inicioMin, duracion, c.inicioMin, c.duracion)) return c;
  }
  return null;
}

/** "16:30" a partir de los minutos desde medianoche. */
export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Horarios de inicio de ese día para una duración, con el motivo de cada uno
 * que no se puede elegir. Se ofrecen cada 30 minutos dentro de la ventana de
 * atención del día (lun-vie 14-22, sáb 8-21, domingo cerrado).
 *
 * `libre: false` + motivo:
 *   - "ocupado": se pisa con otra clase.
 *   - "pasado" : ya pasó (solo aplica al día de hoy).
 */
export interface SlotAlumno {
  inicioMin: number;
  libre: boolean;
  motivo?: "ocupado" | "pasado";
}

export async function horariosDelDiaParaAlumno(
  orgId: string,
  fecha: string,
  duracion: number,
): Promise<SlotAlumno[]> {
  const ventana = ventanaDeOrg(await getOrganizacion(orgId), parseFecha(fecha).getDay());
  if (!ventana) return [];
  // Día sin clase (el profe se lo tomó, feriado…): no se ofrece ningún horario.
  if (await esDiaSinClase(orgId, fecha)) return [];

  const ocupadas = await clasesDelDia(orgId, fecha);
  const ahora = ahoraEn(await zonaDe(orgId));
  const esHoy = fecha === ahora.fecha;

  const slots: SlotAlumno[] = [];
  for (let m = ventana.apertura; m + duracion <= ventana.cierre; m += 30) {
    if (esHoy && m <= ahora.minutos) {
      slots.push({ inicioMin: m, libre: false, motivo: "pasado" });
      continue;
    }
    const choca = ocupadas.some((c) =>
      solapan(m, duracion, c.inicioMin, c.duracion),
    );
    slots.push(
      choca
        ? { inicioMin: m, libre: false, motivo: "ocupado" }
        : { inicioMin: m, libre: true },
    );
  }
  return slots;
}

/**
 * Días en los que no se da clase (el profe se toma el día, un feriado…). Se
 * cargan en Panel → Días sin clase. Ni el bot ni la web del alumno agendan
 * ahí; la dirección sí puede cargar una clase a mano si hace falta.
 */
export async function motivoDiaSinClase(orgId: string, fecha: string): Promise<string | null> {
  const db = dbDeOrg(orgId);
  if (!db) return null;
  const { data, error } = await db
    .from("dias_sin_clase")
    .select("motivo")
    .eq("fecha", fecha)
    .maybeSingle();
  if (error) {
    // Si la tabla no está creada todavía, seguimos como siempre.
    if (!error.message.includes("dias_sin_clase")) {
      console.error("[disponibilidad] no pude leer los días sin clase:", error.message);
    }
    return null;
  }
  return data ? String(data.motivo ?? "") : null;
}

export async function esDiaSinClase(orgId: string, fecha: string): Promise<boolean> {
  return (await motivoDiaSinClase(orgId, fecha)) !== null;
}

export type DiaSinClase = { fecha: string; motivo: string };

export async function listarDiasSinClase(orgId: string, desde: string): Promise<DiaSinClase[]> {
  const db = dbDeOrg(orgId);
  if (!db) return [];
  const { data, error } = await db
    .from("dias_sin_clase")
    .select("fecha, motivo")
    .gte("fecha", desde)
    .order("fecha");
  if (error) return [];
  return (data ?? []).map((d: any) => ({ fecha: String(d.fecha), motivo: String(d.motivo ?? "") }));
}

export async function agregarDiaSinClase(orgId: string, fecha: string, motivo: string): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const { error } = await db.from("dias_sin_clase").upsert({ fecha, motivo });
  if (error) throw new Error(error.message);
}

export async function quitarDiaSinClase(orgId: string, fecha: string): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const { error } = await db.from("dias_sin_clase").delete().eq("fecha", fecha);
  if (error) throw new Error(error.message);
}
