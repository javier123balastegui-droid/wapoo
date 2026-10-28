/**
 * Reglas de agenda de una academia: duración de las clases y la franja del
 * panel. Salen de su fila en organizaciones (ver reglasDe en
 * lib/organizacion.ts); acá están las cuentas, sin nada del servidor, para que
 * las usen también los formularios del navegador.
 */

export type ReglasAgenda = {
  /** Duración mínima de una clase, en minutos. */
  duracionMinima: number;
  /** De cuánto en cuánto crece la duración (30 = de media hora en media hora). */
  pasoDuracion: number;
  /** Cada cuántos minutos se ofrece un horario de inicio en el abanico. */
  granularidad: number;
  /** Pausa sugerida entre clases (minutos). Es un aviso, no un bloqueo. */
  pausa: number;
  /** Franja AMPLIA del panel (el admin puede cargar cualquier horario de acá). */
  apertura: number;
  cierre: number;
  /** La clase más larga que se ofrece: la franja de atención más larga. */
  duracionMaxima: number;
};

/** Las de Academia Demo, que eran las fijas del código. */
export const REGLAS_POR_DEFECTO: ReglasAgenda = {
  duracionMinima: 60,
  pasoDuracion: 30,
  granularidad: 15,
  pausa: 15,
  apertura: 8 * 60,
  cierre: 22 * 60,
  duracionMaxima: 13 * 60,
};

export function duracionValida(minutos: number, r: ReglasAgenda): boolean {
  return (
    Number.isInteger(minutos) &&
    minutos >= r.duracionMinima &&
    (minutos - r.duracionMinima) % r.pasoDuracion === 0
  );
}

/** "1 hora", "2 horas y media", "45 minutos", "1 hora y 15 minutos". */
export function etiquetaDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const base = horas === 1 ? "1 hora" : `${horas} horas`;
  if (!resto) return base;
  return resto === 30 ? `${base} y media` : `${base} y ${resto} minutos`;
}

/** "de media hora en media hora", "de hora en hora", "de 15 en 15 minutos". */
function pasoEnPalabras(min: number): string {
  if (min === 30) return "de media hora en media hora";
  if (min === 60) return "de hora en hora";
  return `de ${min} en ${min} minutos`;
}

/** El mensaje para una duración que no corresponde. */
export function mensajeDuracionInvalida(r: ReglasAgenda): string {
  return `La duración tiene que ser de ${etiquetaDuracion(r.duracionMinima)} o más, ${pasoEnPalabras(r.pasoDuracion)}.`;
}

/** Las duraciones que se ofrecen en los formularios: de la mínima a la
 *  máxima, de a un paso. Tienen que cubrir cualquier clase que el bot pueda
 *  agendar, o al editarla en el panel el formulario no encontraría su
 *  duración. */
export function opcionesDuracion(r: ReglasAgenda): { value: number; label: string }[] {
  const opciones: { value: number; label: string }[] = [];
  for (let m = r.duracionMinima; m <= Math.max(r.duracionMaxima, r.duracionMinima); m += r.pasoDuracion) {
    opciones.push({ value: m, label: etiquetaDuracion(m) });
  }
  return opciones;
}
