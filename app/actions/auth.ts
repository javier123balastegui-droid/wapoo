"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { orgDeLaPeticion } from "@/lib/organizacion-peticion";

export type LoginState = { error?: string } | undefined;

/** Login real con Supabase Auth (email + contraseña). */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá el email y la contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Email o contraseña incorrectos." };
  }

  // Cada academia entra por su dominio: una cuenta de otra academia no
  // inicia sesión acá. Se controla al entrar y no en cada pantalla, para que
  // una falla pasajera al buscar el dominio no deje afuera a nadie que ya
  // estaba adentro (ver lib/auth.ts).
  const [org, { data: perfil }] = await Promise.all([
    orgDeLaPeticion(),
    supabase.from("profiles").select("organizacion_id").eq("id", data.user.id).maybeSingle(),
  ]);
  if (!org || perfil?.organizacion_id !== org.id) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no es de esta academia. Entrá desde la dirección de tu academia." };
  }

  redirect("/panel");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
