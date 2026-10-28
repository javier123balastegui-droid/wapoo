import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAlumnoPorCodigo, type AlumnoPortal } from "./portal-data";

/** Nombre de la cookie donde se guarda el código del alumno. */
export const ALUMNO_COOKIE = "aaf_alumno";

/** Sesión del alumno a partir del código guardado en la cookie.
 *  Memoizada por render. Devuelve null si no hay código válido. */
export const getAlumnoSesion = cache(async (): Promise<AlumnoPortal | null> => {
  const cookieStore = await cookies();
  const codigo = cookieStore.get(ALUMNO_COOKIE)?.value;
  if (!codigo) return null;
  return getAlumnoPorCodigo(codigo);
});

/** Exige sesión de alumno; si no hay, manda a la pantalla de acceso. */
export async function requireAlumno(): Promise<AlumnoPortal> {
  const alumno = await getAlumnoSesion();
  if (!alumno) redirect("/alumno");
  return alumno;
}
