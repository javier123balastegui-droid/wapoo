/**
 * Etiquetas del caché de datos del servidor.
 *
 * Cada tabla que se cachea tiene su etiqueta, y las funciones que la escriben
 * llaman a revalidateTag con esa etiqueta para que la próxima lectura salga
 * fresca. Están todas acá para que, al agregar una escritura nueva, se vea de
 * una qué hay que invalidar.
 *
 * Además de invalidar por evento, cada caché vence solo a los VENCIMIENTO
 * segundos. Es la red de seguridad: si algún día alguien agrega una escritura
 * y se olvida de invalidar, el dato se corrige solo en minutos en lugar de
 * quedar viejo para siempre.
 */
export const TAGS = {
  temas: "temas",
  /** Perfiles del equipo: nombres, roles, quién está activo. */
  equipo: "equipo",
  carreras: "carreras",
} as const;

/**
 * Etiqueta de UNA academia. Toda caché de datos de una organización lleva el
 * id en la clave y en la etiqueta: con una etiqueta global, la caché de una
 * academia se serviría a otra, y una escritura de una invalidaría la de todas.
 */
export function etiquetaDeOrg(etiqueta: string, orgId: string): string {
  return `${etiqueta}:${orgId}`;
}

export const VENCIMIENTO = 300; // 5 minutos

/**
 * Segundo argumento de revalidateTag en Next 16: dice cuánta antigüedad se
 * tolera al invalidar. `expire: 0` es "purgalo ya", que es lo que queremos
 * cuando alguien acaba de guardar un cambio desde la app.
 */
export const AHORA = { expire: 0 } as const;
