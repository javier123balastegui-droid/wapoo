import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mesActualEn, sumarMes, ZONA_ARGENTINA } from "@/lib/fechas";

/**
 * Cobro a las academias (Panel → Plataforma → Cobros).
 *
 * Cada academia paga un abono mensual (en la moneda que se le fije) con el
 * bot incluido hasta un tope de consumo en dólares. Lo que pase del tope se
 * cobra a costo × factor, en dólares. Se cobra a mano: cada mes se arma un
 * resumen por academia y se marca como pagado cuando entra la plata.
 *
 * Ve todas las academias: va con el cliente admin pelado y solo se llama
 * desde pantallas y acciones que pasan por requirePlataforma().
 *
 * Los meses son los de la plataforma (hora de Argentina), igual que bot_uso,
 * que anota el día de cada consulta con esa hora.
 */

export type Plan = {
  abonoMonto: number;
  abonoMoneda: string;
  botTopeUsd: number;
  excedenteFactor: number;
  sinCargo: boolean;
};

export type Cobro = {
  id: string;
  organizacionId: string;
  nombre: string;
  slug: string;
  periodo: string;
  abono: number;
  abonoMoneda: string;
  botCostoUsd: number;
  botTopeUsd: number;
  excedenteUsd: number;
  estado: "PENDIENTE" | "PAGADO";
  pagadoEn: string | null;
  nota: string;
};

/** El resumen de un mes se paga hasta este día del mes siguiente; desde el
 *  día después, figura como atrasado. */
export const DIA_DE_VENCIMIENTO = 10;

function db() {
  const c = createAdminClient();
  if (!c) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return c;
}

export function mesEnCurso(): string {
  return mesActualEn(ZONA_ARGENTINA);
}

export function mesAnterior(): string {
  return sumarMes(mesEnCurso(), -1);
}

/** Lo que se cobra de excedente: lo que pasó del tope, por el factor. */
export function excedenteUsd(costoUsd: number, plan: Pick<Plan, "botTopeUsd" | "excedenteFactor">): number {
  const pasado = Math.max(0, costoUsd - plan.botTopeUsd);
  return Math.round(pasado * plan.excedenteFactor * 100) / 100;
}

// ── Plan ──

function aPlan(f: Record<string, unknown>): Plan {
  return {
    abonoMonto: Number(f.abono_monto ?? 0),
    abonoMoneda: String(f.abono_moneda ?? "ARS"),
    botTopeUsd: Number(f.bot_tope_usd ?? 0),
    excedenteFactor: Number(f.excedente_factor ?? 2),
    sinCargo: f.sin_cargo === true,
  };
}

export async function getPlan(slug: string): Promise<Plan | null> {
  const { data, error } = await db()
    .from("organizaciones")
    .select("abono_monto, abono_moneda, bot_tope_usd, excedente_factor, sin_cargo")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aPlan(data) : null;
}

export async function guardarPlan(slug: string, p: Plan): Promise<void> {
  const { data, error } = await db()
    .from("organizaciones")
    .update({
      abono_monto: p.abonoMonto,
      abono_moneda: p.abonoMoneda,
      bot_tope_usd: p.botTopeUsd,
      excedente_factor: p.excedenteFactor,
      sin_cargo: p.sinCargo,
      actualizado_en: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No existe esa academia.");
}

// ── Consumo del bot ──

/** Lo que gastó el bot de cada academia en un mes, en dólares (por id). */
export async function consumoDelMes(periodo: string): Promise<Map<string, number>> {
  const desde = `${periodo}-01`;
  const hasta = `${sumarMes(periodo, 1)}-01`;
  const total = new Map<string, number>();
  // De a mil filas: es lo máximo que devuelve Supabase por pedido.
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await db()
      .from("bot_uso")
      .select("organizacion_id, costo")
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .order("id")
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      const id = String(f.organizacion_id);
      total.set(id, (total.get(id) ?? 0) + Number(f.costo ?? 0));
    }
    if ((data ?? []).length < 1000) break;
  }
  return total;
}

// ── Resúmenes ──

/**
 * Arma (o actualiza) el resumen de un mes para cada academia activa que
 * paga. Los ya pagados no se tocan. Se puede correr las veces que haga falta:
 * los pendientes se recalculan con el consumo y el plan de ese momento.
 */
export async function generarCobros(periodo: string): Promise<{ creados: number; actualizados: number; pagados: number }> {
  if (periodo >= mesEnCurso()) throw new Error("Solo se arman resúmenes de meses terminados.");
  const c = db();
  const [orgs, existentes, consumo] = await Promise.all([
    c.from("organizaciones")
      .select("id, abono_monto, abono_moneda, bot_tope_usd, excedente_factor, sin_cargo")
      .eq("activa", true)
      .eq("sin_cargo", false),
    c.from("cobros").select("organizacion_id, estado").eq("periodo", periodo),
    consumoDelMes(periodo),
  ]);
  if (orgs.error) throw new Error(orgs.error.message);
  if (existentes.error) throw new Error(existentes.error.message);
  const estadoPrevio = new Map((existentes.data ?? []).map((e) => [String(e.organizacion_id), String(e.estado)]));

  let creados = 0;
  let actualizados = 0;
  let pagados = 0;
  for (const o of orgs.data ?? []) {
    const id = String(o.id);
    const previo = estadoPrevio.get(id);
    if (previo === "PAGADO") {
      pagados++;
      continue;
    }
    const plan = aPlan(o);
    const costo = Math.round((consumo.get(id) ?? 0) * 10000) / 10000;
    const { error } = await c.from("cobros").upsert(
      {
        organizacion_id: id,
        periodo,
        abono: plan.abonoMonto,
        abono_moneda: plan.abonoMoneda,
        bot_costo_usd: costo,
        bot_tope_usd: plan.botTopeUsd,
        excedente_usd: excedenteUsd(costo, plan),
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "organizacion_id,periodo" },
    );
    if (error) throw new Error(error.message);
    if (previo) actualizados++;
    else creados++;
  }
  return { creados, actualizados, pagados };
}

function aCobro(f: Record<string, unknown>): Cobro {
  const org = (f.organizaciones ?? {}) as Record<string, unknown>;
  return {
    id: String(f.id),
    organizacionId: String(f.organizacion_id),
    nombre: String(org.nombre ?? ""),
    slug: String(org.slug ?? ""),
    periodo: String(f.periodo),
    abono: Number(f.abono),
    abonoMoneda: String(f.abono_moneda),
    botCostoUsd: Number(f.bot_costo_usd),
    botTopeUsd: Number(f.bot_tope_usd),
    excedenteUsd: Number(f.excedente_usd),
    estado: f.estado === "PAGADO" ? "PAGADO" : "PENDIENTE",
    pagadoEn: f.pagado_en ? String(f.pagado_en) : null,
    nota: String(f.nota ?? ""),
  };
}

const COLUMNAS = "*, organizaciones(nombre, slug)";

export async function listarCobros(periodo: string): Promise<Cobro[]> {
  const { data, error } = await db().from("cobros").select(COLUMNAS).eq("periodo", periodo);
  if (error) throw new Error(error.message);
  return (data ?? []).map(aCobro).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Los resúmenes de una academia, del más nuevo al más viejo. */
export async function historialDe(slug: string): Promise<Cobro[]> {
  const { data: org } = await db().from("organizaciones").select("id").eq("slug", slug).maybeSingle();
  if (!org) return [];
  const { data, error } = await db()
    .from("cobros")
    .select(COLUMNAS)
    .eq("organizacion_id", org.id)
    .order("periodo", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(aCobro);
}

/** ¿Ese resumen ya está vencido? Pendiente y pasado el día de vencimiento
 *  del mes siguiente (el de septiembre vence el 10 de octubre: desde el 11,
 *  atrasado). */
export function estaAtrasado(c: Pick<Cobro, "estado" | "periodo">, hoy: string): boolean {
  if (c.estado !== "PENDIENTE") return false;
  const vence = `${sumarMes(c.periodo, 1)}-${String(DIA_DE_VENCIMIENTO).padStart(2, "0")}`;
  return hoy > vence;
}

/** Cuántos resúmenes atrasados tiene cada academia (por id). */
export async function atrasosPorAcademia(hoy: string): Promise<Map<string, number>> {
  const { data, error } = await db().from("cobros").select("organizacion_id, periodo, estado").eq("estado", "PENDIENTE");
  if (error) throw new Error(error.message);
  const atrasos = new Map<string, number>();
  for (const f of data ?? []) {
    if (estaAtrasado({ estado: "PENDIENTE", periodo: String(f.periodo) }, hoy)) {
      const id = String(f.organizacion_id);
      atrasos.set(id, (atrasos.get(id) ?? 0) + 1);
    }
  }
  return atrasos;
}

export async function marcarCobro(id: string, pagado: boolean, nota: string): Promise<void> {
  const { data, error } = await db()
    .from("cobros")
    .update({
      estado: pagado ? "PAGADO" : "PENDIENTE",
      pagado_en: pagado ? new Date().toISOString() : null,
      nota,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No existe ese resumen.");
}
