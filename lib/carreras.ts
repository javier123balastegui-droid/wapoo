import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbDeOrg } from "@/lib/supabase/org";
import { TAGS, VENCIMIENTO, AHORA, etiquetaDeOrg } from "@/lib/cache-tags";

/**
 * Carreras que se ofrecen, editables desde Panel → Carreras (tabla
 * `carreras`). Las usan el alta de alumnos y el formulario de inscripción de
 * la web, que es público: por eso se leen con el cliente del servidor y no
 * desde el navegador.
 *
 * Si la tabla todavía no está creada o quedó vacía, se usa la lista histórica
 * de `lib/constants.ts`, así ningún formulario se queda sin opciones.
 */

export type Carrera = { id: string; nombre: string; activa: boolean };

/** "Instrumentación quirúrgica" → "instrumentacion-quirurgica". */
export function idDeCarrera(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Lectura cacheada: pocas filas que casi nunca cambian. La organización va
 *  en la clave y en la etiqueta de la caché. */
function leer(orgId: string): Promise<Carrera[]> {
  return unstable_cache(
    async (): Promise<Carrera[]> => {
      const db = dbDeOrg(orgId);
      if (!db) return [];
      const { data, error } = await db
        .from("carreras")
        .select("id, nombre, activa")
        .order("nombre");
      // Tira en vez de devolver vacío: si no, un vacío por falla quedaría
      // cacheado cinco minutos (ver el mismo criterio en lib/mock-data.ts).
      if (error) throw new Error(error.message);
      return (data ?? []).map((c) => ({
        id: String(c.id),
        nombre: String(c.nombre),
        activa: c.activa !== false,
      }));
    },
    ["carreras", orgId],
    { tags: [etiquetaDeOrg(TAGS.carreras, orgId)], revalidate: VENCIMIENTO },
  )();
}

/** Todas, incluidas las desactivadas. Para el panel.
 *
 *  Antes, si la lectura fallaba o la tabla estaba vacía, se usaba la lista
 *  fija de carreras de salud de lib/constants.ts. Con varias academias eso le
 *  mostraría carreras de anatomía a cualquiera: ahora, sin filas, no hay
 *  opciones. */
export async function listarCarreras(orgId: string): Promise<Carrera[]> {
  try {
    return await leer(orgId);
  } catch (e) {
    console.error("[carreras] no pude leerlas:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Solo los nombres de las activas, para los desplegables. */
export async function carrerasActivas(orgId: string): Promise<string[]> {
  return (await listarCarreras(orgId)).filter((c) => c.activa).map((c) => c.nombre);
}

export async function crearCarrera(orgId: string, nombre: string): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const limpio = nombre.trim();
  if (!limpio) throw new Error("Escribí el nombre de la carrera.");
  const { error } = await db
    .from("carreras")
    .insert({ id: idDeCarrera(limpio), nombre: limpio });
  if (error) {
    throw new Error(
      error.code === "23505" ? "Esa carrera ya está en la lista." : error.message,
    );
  }
  revalidateTag(etiquetaDeOrg(TAGS.carreras, orgId), AHORA);
}

/** Deja de ofrecerse (o vuelve a ofrecerse). No toca a los alumnos que ya la tienen. */
export async function setCarreraActiva(orgId: string, id: string, activa: boolean): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const { error } = await db.from("carreras").update({ activa }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateTag(etiquetaDeOrg(TAGS.carreras, orgId), AHORA);
}

export async function eliminarCarrera(orgId: string, id: string): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const { error } = await db.from("carreras").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateTag(etiquetaDeOrg(TAGS.carreras, orgId), AHORA);
}
