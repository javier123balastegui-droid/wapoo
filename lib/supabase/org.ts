import "server-only";
import { createAdminClient } from "./admin";

type Fila = Record<string, unknown>;

/**
 * Acceso a la base con privilegios de servidor, ATADO A UNA ORGANIZACIÓN.
 *
 * El cliente admin (service role) se saltea las reglas de acceso de la base,
 * así que ahí nada impide que una academia lea o pise datos de otra. Este
 * envoltorio lo impide en el código: toda lectura, modificación y borrado
 * lleva `organizacion_id = orgId`, y todo insert/upsert lo completa solo.
 *
 * Es la forma de usar el cliente admin para datos de una academia. El cliente
 * admin pelado queda solo para lo que no es de ninguna organización (crear
 * usuarios en Auth, buscar la organización misma, el código de acceso del
 * portal antes de saber de qué academia es).
 *
 * Devuelve null si falta la clave secreta, igual que createAdminClient, para
 * que el código que ya contemplaba ese caso siga igual.
 */
export function dbDeOrg(orgId: string) {
  if (!orgId) throw new Error("dbDeOrg: falta la organización");
  const db = createAdminClient();
  if (!db) return null;

  function conOrg(filas: Fila | Fila[]): Fila | Fila[] {
    return Array.isArray(filas)
      ? filas.map((f) => ({ ...f, organizacion_id: orgId }))
      : { ...filas, organizacion_id: orgId };
  }

  return {
    orgId,
    // Devuelve el mismo constructor de consultas de supabase-js, con su tipo
    // intacto (así las filas se tipan igual que con el cliente pelado), pero
    // con los cinco métodos reemplazados en esa instancia para que agreguen
    // el filtro o completen la columna. Los `any` son internos a este reenvío:
    // envolver los tipos genéricos de supabase-js deja a TypeScript sin memoria.
    from: ((tabla: string) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const q = db.from(tabla) as any;
      const { select, insert, upsert, update, delete: borrar } = {
        select: q.select.bind(q),
        insert: q.insert.bind(q),
        upsert: q.upsert.bind(q),
        update: q.update.bind(q),
        delete: q.delete.bind(q),
      };
      q.select = (...args: unknown[]) => select(...args).eq("organizacion_id", orgId);
      q.insert = (filas: Fila | Fila[], ...resto: unknown[]) => insert(conOrg(filas), ...resto);
      q.upsert = (filas: Fila | Fila[], ...resto: unknown[]) => upsert(conOrg(filas), ...resto);
      // organizacion_id no se puede cambiar por acá: una fila no se muda de
      // academia por una actualización.
      q.update = (valores: Fila, ...resto: unknown[]) =>
        update({ ...valores, organizacion_id: orgId }, ...resto).eq("organizacion_id", orgId);
      q.delete = (...args: unknown[]) => borrar(...args).eq("organizacion_id", orgId);
      return q;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }) as typeof db.from,
    /** Funciones de la base: siempre reciben la organización como `org`. */
    rpc(funcion: string, args: Fila = {}) {
      return db.rpc(funcion, { ...args, org: orgId });
    },
    /** El depósito de archivos no tiene organización: usá rutas que empiecen
     *  con el orgId (ver lib/bot/comprobantes.ts). */
    storage: db.storage,
  };
}

export type DbDeOrg = NonNullable<ReturnType<typeof dbDeOrg>>;
