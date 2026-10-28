import type { ReglasAgenda } from "./agenda-reglas";

export interface Intervalo {
  inicioMin: number;
  duracion: number;
}

export interface SlotInfo {
  inicioMin: number;
  /** No seleccionable: la clase NO entra antes del cierre. */
  disabled: boolean;
  /** Seleccionable, pero se superpone con otra clase de ese profe (advertencia). */
  ocupado: boolean;
  /** Disponible pero deja menos pausa que la sugerida (pegado a otra clase). */
  ajustado: boolean;
}

/** Genera los horarios de inicio candidatos (de apertura a cierre del panel
 *  de la academia). */
export function generarSlots(r: ReglasAgenda): number[] {
  const slots: number[] = [];
  for (let t = r.apertura; t <= r.cierre; t += r.granularidad) {
    slots.push(t);
  }
  return slots;
}

function solapan(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

/**
 * Calcula el estado de cada horario de inicio para una duración dada,
 * considerando las clases ya ocupadas (de ese profe y esa fecha).
 */
export function calcularSlots(
  duracion: number,
  ocupados: Intervalo[],
  r: ReglasAgenda,
): SlotInfo[] {
  return generarSlots(r).map((inicioMin) => {
    const fin = inicioMin + duracion;
    // Solo se BLOQUEA lo que no entra antes del cierre. El solapamiento con otra
    // clase del profe es una advertencia (el admin puede elegirlo igual).
    const disabled = fin > r.cierre;
    let ocupado = false;
    let minGap = Infinity;

    for (const oc of ocupados) {
      const ocFin = oc.inicioMin + oc.duracion;
      if (solapan(inicioMin, fin, oc.inicioMin, ocFin)) {
        ocupado = true;
      }
      // Distancia (gap) a este bloque ocupado, si no se solapan
      if (fin <= oc.inicioMin) minGap = Math.min(minGap, oc.inicioMin - fin);
      else if (inicioMin >= ocFin) minGap = Math.min(minGap, inicioMin - ocFin);
    }

    const ajustado = !disabled && !ocupado && minGap < r.pausa;
    return { inicioMin, disabled, ocupado, ajustado };
  });
}

/** ¿La duración entra en el horario, sin solaparse, en ese inicio? */
export function inicioValido(
  inicioMin: number,
  duracion: number,
  ocupados: Intervalo[],
  r: ReglasAgenda,
): boolean {
  const info = calcularSlots(duracion, ocupados, r).find(
    (s) => s.inicioMin === inicioMin,
  );
  return !!info && !info.disabled;
}
