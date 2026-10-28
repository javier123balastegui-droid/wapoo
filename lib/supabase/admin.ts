import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con privilegios de administrador (service_role / secret key).
 * Solo se usa en el servidor para operaciones de admin (crear usuarios).
 * Devuelve null si todavía no se configuró la clave secreta.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
