import type { Tarifa, TipoClase, EstadoRealizacion } from "./types";

/** Precios por hora cargados en Finanzas. Se describe la forma acá (y no se
 *  importa de mock-data) para que este módulo sirva también del lado cliente. */
export interface PreciosPorHora {
  valorIndividual: number;
  valorGrupal2: number;
  valorGrupal3: number;
}

/**
 * Cálculo de plata. Todo se cobra y se paga PROPORCIONAL A LAS HORAS: los
 * valores cargados en Finanzas son el precio de UNA HORA.
 *
 *   1 hora        → valor × 1
 *   1 hora y media → valor × 1.5
 *   2 horas       → valor × 2
 *
 * Antes se cobraba/liquidaba por clase sin mirar la duración, así que una clase
 * de 2 horas valía lo mismo que una de 1 (bug reportado por el cliente: la
 * liquidación al profe del mes no servía).
 *
 * La SEÑA es la excepción: es un monto fijo para reservar, no depende de la
 * duración.
 */

/** Cuántas horas equivale la duración (60 → 1, 90 → 1.5, 120 → 2). */
export function enHoras(duracionMin: number): number {
  return duracionMin / 60;
}

/** Redondea a peso entero (evita centavos raros en 1.5 × precio impar). */
function aPesos(n: number): number {
  return Math.round(n);
}

/**
 * Lo que paga UN alumno por la clase, según modalidad, cuántos son y cuánto
 * dura. En las grupales el precio es por alumno y baja si son 3 o más.
 */
export function precioAlumno(
  precios: PreciosPorHora,
  tipo: TipoClase,
  cantidadAlumnos: number,
  duracionMin: number,
): number {
  const porHora =
    tipo === "GRUPAL"
      ? cantidadAlumnos >= 3
        ? precios.valorGrupal3
        : precios.valorGrupal2
      : precios.valorIndividual;
  return aPesos(porHora * enHoras(duracionMin));
}

/**
 * Lo que se le paga al profe por una clase, según qué pasó con ella:
 *
 *  - Realizada (o todavía sin marcar): tarifa por hora × las horas que duró.
 *  - Cancelada a último momento / el alumno no se conectó: el alumno no paga
 *    (pierde la seña), pero el profe reservó ese horario, así que cobra una
 *    **compensación fija** que no depende de la duración.
 *  - Reagendada: no se paga acá; la clase se movió y se paga en su fecha nueva
 *    (si se pagara en las dos, se le estaría pagando dos veces).
 */
export function pagoProfe(
  tarifa:
    | Pick<
        Tarifa,
        | "valorGrupal"
        | "valorIndividual"
        | "valorCanceladaIndividual"
        | "valorCanceladaGrupal"
      >
    | undefined,
  tipo: TipoClase,
  duracionMin: number,
  estado: EstadoRealizacion = "REALIZADA",
): number {
  if (!tarifa) return 0;

  if (estado === "REAGENDADA") return 0;

  if (estado === "CANCELADA" || estado === "AUSENTE") {
    const fijo =
      tipo === "GRUPAL"
        ? tarifa.valorCanceladaGrupal
        : tarifa.valorCanceladaIndividual;
    return aPesos(fijo ?? 0);
  }

  const porHora =
    tipo === "GRUPAL" ? tarifa.valorGrupal : tarifa.valorIndividual;
  return aPesos((porHora ?? 0) * enHoras(duracionMin));
}

/** Etiqueta corta de duración para mostrar: "1 h", "1 h 30", "2 h". */
export function duracionLabel(duracionMin: number): string {
  const h = Math.floor(duracionMin / 60);
  const m = duracionMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
