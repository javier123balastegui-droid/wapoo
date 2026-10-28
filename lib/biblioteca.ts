import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";

/**
 * Biblioteca de anatomía: el texto de los libros de referencia, partido en
 * fragmentos, para que el bot pueda buscar el pasaje que corresponde a la
 * pregunta de una alumna.
 *
 * El texto se extrae en el NAVEGADOR (ver components/biblioteca/subir-libro).
 * Vercel no acepta subidas de más de 4,5 MB y un libro de anatomía pesa mucho
 * más, así que acá solo llegan los fragmentos ya procesados, de a tandas.
 *
 * La búsqueda la hace Postgres con su buscador de texto en español, vía la
 * función buscar_biblioteca (ver supabase/schema.sql). No hay servicio externo.
 */

export type DocumentoBiblioteca = {
  id: string;
  titulo: string;
  autor: string;
  fragmentos: number;
  creadoEn: string;
};

export type FragmentoNuevo = {
  orden: number;
  pagina: number | null;
  contenido: string;
};

export type PasajeEncontrado = {
  documento: string;
  pagina: number | null;
  contenido: string;
};

export async function listarDocumentos(orgId: string): Promise<DocumentoBiblioteca[]> {
  const db = dbDeOrg(orgId);
  if (!db) return [];
  const { data } = await db
    .from("biblioteca_documentos")
    .select("id, titulo, autor, fragmentos, creado_en")
    .order("creado_en", { ascending: false });
  return (data ?? []).map((d) => ({
    id: d.id,
    titulo: d.titulo,
    autor: d.autor,
    fragmentos: d.fragmentos,
    creadoEn: d.creado_en,
  }));
}

export async function crearDocumento(
  orgId: string,
  titulo: string,
  autor: string,
): Promise<string> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  const id = `doc-${Date.now()}`;
  const { error } = await db
    .from("biblioteca_documentos")
    .insert({ id, titulo, autor });
  if (error) throw new Error(error.message);
  return id;
}

/** Guarda una tanda de fragmentos. El navegador las manda de a poco para no
 *  pasarse del límite de tamaño de una request. */
export async function guardarFragmentos(
  orgId: string,
  documentoId: string,
  fragmentos: FragmentoNuevo[],
): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  if (fragmentos.length === 0) return;

  const filas = fragmentos.map((f) => ({
    id: `${documentoId}-${f.orden}`,
    documento_id: documentoId,
    orden: f.orden,
    pagina: f.pagina,
    contenido: f.contenido,
  }));
  const { error } = await db.from("biblioteca_fragmentos").insert(filas);
  if (error) throw new Error(error.message);
}

export async function actualizarConteo(
  orgId: string,
  documentoId: string,
  total: number,
): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) return;
  await db
    .from("biblioteca_documentos")
    .update({ fragmentos: total })
    .eq("id", documentoId);
}

export async function eliminarDocumento(orgId: string, id: string): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  // Los fragmentos se van solos: la tabla tiene on delete cascade.
  const { error } = await db
    .from("biblioteca_documentos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Busca en la biblioteca los pasajes más relevantes para una consulta.
 *
 * Devuelve lista vacía si no hay nada cargado o si no hay coincidencias — y eso
 * es información valiosa para el bot: significa que tiene que decir que no lo
 * tiene, en vez de improvisar.
 */
/** Cuántos pasajes puede aportar cada libro a una misma consulta. Sin tope,
 *  un libro moderno y compacto (que repite más los términos por párrafo) le
 *  gana siempre en puntaje a un tratado clásico que dice lo mismo en prosa
 *  más larga, y el bot termina leyendo un solo autor. */
const MAX_POR_LIBRO = 2;

export async function buscarEnBiblioteca(
  orgId: string,
  consulta: string,
  limite = 6,
): Promise<PasajeEncontrado[]> {
  const db = dbDeOrg(orgId);
  if (!db) return [];

  // Pedimos de más para después poder repartir entre libros.
  const buscar = async (q: string) => {
    // dbDeOrg le agrega `org`: busca solo en los libros de esta academia.
    const { data, error } = await db.rpc("buscar_biblioteca_org", {
      consulta: q,
      limite: limite * 5,
    });
    if (error) {
      console.error("[biblioteca] falló la búsqueda:", error.message);
      return [];
    }
    return data ?? [];
  };

  let filas = await buscar(consulta);
  // La búsqueda exige TODAS las palabras. Si no aparece nada (el libro dice
  // "conducto carpiano" y la consulta "túnel carpiano"), probamos con
  // cualquiera de ellas: los pasajes que tienen más, puntúan más.
  if (filas.length === 0) {
    const palabras = consulta.split(/\s+/).filter((p) => p.length > 2);
    if (palabras.length > 1) filas = await buscar(palabras.join(" or "));
  }

  // Los mejores de cada libro primero; si sobra lugar, se completa con el resto.
  const porLibro = new Map<string, number>();
  const primeros: typeof filas = [];
  const resto: typeof filas = [];
  for (const r of filas) {
    const n = porLibro.get(r.documento_titulo) ?? 0;
    if (n < MAX_POR_LIBRO) {
      primeros.push(r);
      porLibro.set(r.documento_titulo, n + 1);
    } else {
      resto.push(r);
    }
  }

  return [...primeros, ...resto].slice(0, limite).map((r) => ({
    documento: r.documento_titulo,
    pagina: r.pagina,
    contenido: r.contenido,
  }));
}
