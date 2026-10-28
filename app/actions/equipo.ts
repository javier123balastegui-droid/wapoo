"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS, AHORA, etiquetaDeOrg } from "@/lib/cache-tags";
import { requireAdmin } from "@/lib/auth";
import { setUsuarioActivo, setTelefonoUsuario } from "@/lib/mock-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbDeOrg } from "@/lib/supabase/org";

type UsuarioErrors = { nombre?: string; email?: string; password?: string };
export type UsuarioFormState =
  | { error?: string; errors?: UsuarioErrors }
  | undefined;

export async function crearUsuarioAction(
  _prev: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const { organizacionId: orgId } = await requireAdmin();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rol = formData.get("rol") === "ADMIN" ? "ADMIN" : "PROFE";

  const errors: UsuarioErrors = {};
  if (!nombre) errors.nombre = "Ingresá el nombre.";
  if (!email) errors.email = "Ingresá el email.";
  if (password.length < 6) errors.password = "Mínimo 6 caracteres.";
  if (Object.keys(errors).length > 0) return { errors };

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Para crear usuarios falta configurar la clave secreta de Supabase. Mientras tanto, podés agregar profesores o administradores desde Supabase → Authentication → Add user.",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
    // La academia va en app_metadata, que solo escribe el servidor: el
    // trigger handle_new_user la lee de ahí para crear el perfil en ella.
    app_metadata: { organizacion_id: orgId },
  });
  if (error) {
    return {
      error: /already|registered|exists/i.test(error.message)
        ? "Ya existe un usuario con ese email."
        : "No se pudo crear el usuario: " + error.message,
    };
  }

  // El rol y la activación se escriben ACÁ, no se le pasan en el metadata.
  //
  // El metadata lo controla quien se registra, así que el trigger de la base
  // (handle_new_user) ya no lo mira: crea todo perfil como PROFE e inactivo.
  // De otro modo, con el registro público abierto, cualquiera podía mandar
  // { rol: "ADMIN" } en un signUp y entrar al panel con acceso total.
  //
  // Este camino es el único que puede dar un rol, y pasa por requireAdmin()
  // arriba de esta función. Va con upsert para no depender de si el trigger
  // alcanzó a crear la fila.
  if (data?.user) {
    // Siempre en la academia del admin que lo crea.
    const { error: errPerfil } = await dbDeOrg(orgId)!
      .from("profiles")
      .upsert({ id: data.user.id, email, nombre, rol, activo: true });
    if (errPerfil) {
      return {
        error:
          "Se creó la cuenta pero no se le pudo asignar el rol: " +
          errPerfil.message +
          ". Revisá el equipo antes de que la persona entre.",
      };
    }
  }

  // getUsuarios() está cacheado: sin esto el usuario nuevo no aparece.
  revalidateTag(etiquetaDeOrg(TAGS.equipo, orgId), AHORA);
  revalidatePath("/panel/equipo");
  redirect("/panel/equipo");
}

export async function toggleUsuarioActivoAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  await setUsuarioActivo(id, activo);
  revalidatePath("/panel/equipo");
}

export async function setTelefonoUsuarioAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const telefono = String(formData.get("telefono") ?? "").trim();
  if (id) await setTelefonoUsuario(id, telefono);
  revalidatePath("/panel/equipo");
}
