import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";
import { ahoraEn } from "@/lib/fechas";
import { zonaDe } from "@/lib/organizacion";

/**
 * Cuánto consume el bot y cuánto saldo queda.
 *
 * Claude no publica el saldo por API, así que acá se anota lo que gasta cada
 * respuesta (tokens y búsquedas en internet, con su costo según la lista de
 * precios) y en el panel se carga a mano cuánto saldo se puso. El saldo que
 * queda es esa carga menos lo gastado desde entonces.
 *
 * Nunca tira error: si no se puede anotar el uso, el alumno igual recibe su
 * respuesta.
 */

/** Precios en dólares por millón de tokens (lista de Anthropic). */
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  "claude-sonnet-5": { entrada: 2, salida: 10 },
  "claude-haiku-4-5": { entrada: 1, salida: 5 },
};
/** Lo ya enviado se cobra al 10%; dejarlo en caché, un 25% más caro. */
const FACTOR_CACHE_LECTURA = 0.1;
const FACTOR_CACHE_ESCRITURA = 1.25;
/** Cada búsqueda en internet: USD 10 cada 1.000. */
const PRECIO_BUSQUEDA = 0.01;

export type UsoLlamada = {
  modelo: string;
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura: number;
  busquedas: number;
};

export function costoDe(u: UsoLlamada): number {
  const p = PRECIOS[u.modelo] ?? PRECIOS["claude-sonnet-5"];
  const porMillon = (tokens: number, precio: number) => (tokens / 1_000_000) * precio;
  return (
    porMillon(u.entrada, p.entrada) +
    porMillon(u.cacheLectura, p.entrada * FACTOR_CACHE_LECTURA) +
    porMillon(u.cacheEscritura, p.entrada * FACTOR_CACHE_ESCRITURA) +
    porMillon(u.salida, p.salida) +
    u.busquedas * PRECIO_BUSQUEDA
  );
}

export async function registrarUso(orgId: string, u: UsoLlamada): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) return;
  const { error } = await db.from("bot_uso").insert({
    fecha: ahoraEn(await zonaDe(orgId)).fecha,
    modelo: u.modelo,
    entrada: u.entrada,
    salida: u.salida,
    cache_lectura: u.cacheLectura,
    cache_escritura: u.cacheEscritura,
    busquedas: u.busquedas,
    costo: Number(costoDe(u).toFixed(6)),
  });
  if (error) console.error("[uso] no pude anotar el consumo:", error.message);
}

export type ResumenSaldo = {
  /** Última carga de saldo registrada (si hay). */
  cargado: { monto: number; fecha: string } | null;
  /** Gastado desde esa carga (o total, si nunca se cargó). */
  gastadoDesdeCarga: number;
  /** Lo que queda, estimado. null si nunca se cargó saldo. */
  restante: number | null;
  gastoHoy: number;
  gastoSemana: number;
  gastoMes: number;
  /** Promedio por día de los últimos 7 días con actividad. */
  promedioDiario: number;
  /** Días que durará el saldo al ritmo actual. null si no se puede estimar. */
  diasRestantes: number | null;
  /** Respuestas del bot contabilizadas en los últimos 7 días. */
  respuestasSemana: number;
};

export async function resumenSaldo(orgId: string): Promise<ResumenSaldo> {
  const vacio: ResumenSaldo = {
    cargado: null,
    gastadoDesdeCarga: 0,
    restante: null,
    gastoHoy: 0,
    gastoSemana: 0,
    gastoMes: 0,
    promedioDiario: 0,
    diasRestantes: null,
    respuestasSemana: 0,
  };
  const db = dbDeOrg(orgId);
  if (!db) return vacio;

  const { data: cargas } = await db
    .from("bot_saldo")
    .select("monto, cargado_en")
    .order("cargado_en", { ascending: false })
    .limit(1);
  const carga = cargas?.[0]
    ? { monto: Number(cargas[0].monto), fecha: String(cargas[0].cargado_en) }
    : null;

  const { data: filas, error } = await db
    .from("bot_uso")
    .select("fecha, costo, creado_en")
    .gte("creado_en", new Date(Date.now() - 45 * 86400_000).toISOString());
  if (error) {
    console.error("[uso] no pude leer el gasto:", error.message);
    return vacio;
  }

  const hoy = ahoraEn(await zonaDe(orgId)).fecha;
  const mes = hoy.slice(0, 7);
  const desdeSemana = Date.now() - 7 * 86400_000;
  let gastoHoy = 0, gastoSemana = 0, gastoMes = 0, respuestasSemana = 0;
  const porDia = new Map<string, number>();
  for (const f of filas ?? []) {
    const costo = Number(f.costo);
    const fecha = String(f.fecha);
    if (fecha === hoy) gastoHoy += costo;
    if (fecha.startsWith(mes)) gastoMes += costo;
    if (new Date(String(f.creado_en)).getTime() >= desdeSemana) {
      gastoSemana += costo;
      respuestasSemana++;
      porDia.set(fecha, (porDia.get(fecha) ?? 0) + costo);
    }
  }

  // Promedio sobre los días que hubo movimiento: con el bot recién prendido,
  // dividir por 7 días daría una autonomía irreal.
  const diasConUso = porDia.size || 1;
  const promedioDiario = gastoSemana / diasConUso;

  let gastadoDesdeCarga = 0;
  if (carga) {
    const desde = new Date(carga.fecha).getTime();
    for (const f of filas ?? []) {
      if (new Date(String(f.creado_en)).getTime() >= desde) gastadoDesdeCarga += Number(f.costo);
    }
  }
  const restante = carga ? Math.max(carga.monto - gastadoDesdeCarga, 0) : null;
  const diasRestantes =
    restante !== null && promedioDiario > 0 ? Math.floor(restante / promedioDiario) : null;

  return {
    cargado: carga,
    gastadoDesdeCarga,
    restante,
    gastoHoy,
    gastoSemana,
    gastoMes,
    promedioDiario,
    diasRestantes,
    respuestasSemana,
  };
}

export async function registrarCargaSaldo(orgId: string, monto: number, nota = ""): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  if (!(monto > 0)) throw new Error("Escribí cuánto saldo cargaste, en dólares.");
  const { error } = await db.from("bot_saldo").insert({ monto, nota });
  if (error) throw new Error(error.message);
}

/**
 * Aviso de saldo bajo: si al ritmo actual queda una semana o menos, le avisa
 * a la dirección al celular. Lo llama el cron de la mañana, una vez por día.
 * Devuelve true si avisó.
 */
export async function avisarSiFaltaSaldo(orgId: string): Promise<boolean> {
  const r = await resumenSaldo(orgId);
  if (r.restante === null || r.diasRestantes === null || r.diasRestantes > 7) return false;
  const { notificarAdmins } = await import("@/lib/push");
  await notificarAdmins(orgId, {
    titulo: "Al bot le queda poco saldo",
    cuerpo:
      `Quedan unos USD ${r.restante.toFixed(2)}: alcanzan para unos ${r.diasRestantes} ` +
      `días al ritmo de estos días. Cargá saldo así no deja de responder.`,
    url: "/panel/bot",
  });
  return true;
}
