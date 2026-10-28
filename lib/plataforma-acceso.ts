import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";

// Quién puede administrar la plataforma. Aparte de lib/plataforma.ts porque
// usa la sesión y las redirecciones de Next: así lo demás se puede probar con
// scripts, fuera de Next.

export const esAdminPlataforma = cache(async (userId: string): Promise<boolean> => {
  const db = createAdminClient();
  if (!db) return false;
  const { data, error } = await db
    .from("plataforma_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  // Ante un error, no: es preferible no mostrar la pantalla a mostrarla de más.
  return !error && Boolean(data);
});

/** Exige ser administrador de la plataforma; si no, vuelve al panel. */
export async function requirePlataforma(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await esAdminPlataforma(user.id))) redirect("/panel");
  return user;
}
