import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { SessionUser, Rol } from "./types";

/**
 * Devuelve el usuario logueado (con su perfil/rol) o null.
 * Usa Supabase Auth + la tabla profiles. Memoizado por render.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // OJO: esta lectura NO se cachea, y es a propósito.
  //
  // Se probó cachearla con unstable_cache para ahorrar unos 90 ms por
  // pantalla, y fue un error: unstable_cache guarda lo que devuelva la
  // función, así que si la consulta fallaba una vez y devolvía vacío, ese
  // vacío quedaba cacheado 5 minutos. Y sin perfil la app trata al usuario
  // como no logueado: un error transitorio de la base dejaba a todo el equipo
  // afuera por 5 minutos. Pasó en una prueba, con la sesión cayéndose sola.
  //
  // La autenticación no puede depender de un caché que pueda memorizar una
  // falla. Si algún día hay que acelerar esto, tiene que ser con algo que
  // nunca guarde el caso de error.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, activo, organizacion_id")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.activo || !profile.organizacion_id) return null;

  return {
    id: profile.id,
    nombre: profile.nombre || user.email || "",
    email: profile.email ?? user.email ?? "",
    rol: profile.rol as Rol,
    organizacionId: String(profile.organizacion_id),
  };
});

/** Exige sesión iniciada; si no, redirige al login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige rol ADMIN; si es profe lo manda al panel; si no hay sesión, al login. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect("/panel");
  return user;
}
