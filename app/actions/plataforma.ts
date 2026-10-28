"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  crearAcademia,
  actualizarAcademia,
  guardarColores,
  subirLogo,
  quitarLogo,
  agregarDominio,
  quitarDominio,
  guardarWhatsApp,
  setAcademiaActiva,
  getAcademia,
  dominioValido,
  slugDe,
  PATRON_SLUG,
  SLUGS_RESERVADOS,
} from "@/lib/plataforma";
import { leerDatosEditables } from "@/lib/plataforma-form";
import { requirePlataforma } from "@/lib/plataforma-acceso";

export type AcademiaFormState =
  | { error?: string; errors?: Record<string, string> }
  | undefined;

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

export async function crearAcademiaAction(
  _prev: AcademiaFormState,
  fd: FormData,
): Promise<AcademiaFormState> {
  await requirePlataforma();
  const { datos, errors } = leerDatosEditables(fd);

  const slug = texto(fd, "slug") || slugDe(datos.nombre);
  const dominio = dominioValido(texto(fd, "dominio"));
  const admin = {
    nombre: texto(fd, "adminNombre"),
    email: texto(fd, "adminEmail").toLowerCase(),
    password: String(fd.get("adminPassword") ?? ""),
  };
  if (!PATRON_SLUG.test(slug)) errors.slug = "Solo minúsculas, números y guiones (ej: matematica-facil).";
  else if (SLUGS_RESERVADOS.includes(slug)) errors.slug = "Ese identificador está reservado. Elegí otro.";
  if (!dominio) errors.dominio = "Ingresá un dominio válido (ej: matematicafacil.com.ar).";
  if (!admin.nombre) errors.adminNombre = "Ingresá el nombre del administrador.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.email)) errors.adminEmail = "Ingresá un email válido.";
  if (admin.password.length < 8) errors.adminPassword = "Mínimo 8 caracteres.";
  if (Object.keys(errors).length) return { errors };

  try {
    await crearAcademia({ ...datos, slug, dominio: dominio!, admin });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear la academia." };
  }
  revalidatePath("/panel/plataforma");
  redirect(`/panel/plataforma/${slug}`);
}

export async function editarAcademiaAction(
  _prev: AcademiaFormState,
  fd: FormData,
): Promise<AcademiaFormState> {
  await requirePlataforma();
  const slug = texto(fd, "slug");
  const { datos, errors } = leerDatosEditables(fd);
  if (Object.keys(errors).length) return { errors };
  try {
    await actualizarAcademia(slug, datos);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron guardar los cambios." };
  }
  revalidatePath("/panel/plataforma");
  revalidatePath(`/panel/plataforma/${slug}`);
  redirect(`/panel/plataforma/${slug}`);
}

export type FichaState = { error?: string; ok?: string } | undefined;

export async function agregarDominioAction(_prev: FichaState, fd: FormData): Promise<FichaState> {
  await requirePlataforma();
  const slug = texto(fd, "slug");
  const dominio = dominioValido(texto(fd, "dominio"));
  if (!dominio) return { error: "Ingresá un dominio válido (ej: matematicafacil.com.ar)." };
  try {
    await agregarDominio(slug, dominio);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo agregar el dominio." };
  }
  revalidatePath(`/panel/plataforma/${slug}`);
  return { ok: `Listo: ${dominio} quedó registrado. Falta agregarlo en Vercel y apuntar el DNS.` };
}

export async function quitarDominioAction(fd: FormData): Promise<void> {
  await requirePlataforma();
  const slug = texto(fd, "slug");
  await quitarDominio(slug, texto(fd, "dominio"));
  revalidatePath(`/panel/plataforma/${slug}`);
}

export async function guardarWhatsAppAction(_prev: FichaState, fd: FormData): Promise<FichaState> {
  await requirePlataforma();
  const slug = texto(fd, "slug");
  const phoneNumberId = texto(fd, "phoneNumberId").replace(/\D/g, "");
  const token = texto(fd, "token");
  const appSecret = texto(fd, "appSecret");
  if (phoneNumberId.length < 10) {
    return { error: "El identificador del número son solo dígitos (unos 15). Está en Meta → WhatsApp → Configuración de la API." };
  }
  if (Boolean(token) !== Boolean(appSecret)) {
    return { error: "Con la cuenta de Meta de la academia hacen falta los dos: el token y el secreto de la app." };
  }
  try {
    await guardarWhatsApp(slug, {
      phoneNumberId,
      numeroVisible: texto(fd, "numeroVisible"),
      token: token || undefined,
      appSecret: appSecret || undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el número." };
  }
  revalidatePath(`/panel/plataforma/${slug}`);
  return { ok: "Número guardado. Puede tardar unos minutos en empezar a atender." };
}

export async function setAcademiaActivaAction(fd: FormData): Promise<void> {
  const user = await requirePlataforma();
  const slug = texto(fd, "slug");
  const activa = fd.get("activa") === "true";
  // La academia de tu propia cuenta no se puede desactivar desde acá: un clic
  // cortaría el panel desde el que se maneja todo (y, hoy, producción).
  if (!activa && (await getAcademia(slug))?.id === user.organizacionId) return;
  await setAcademiaActiva(slug, activa);
  revalidatePath(`/panel/plataforma/${slug}`);
  revalidatePath("/panel/plataforma");
}

export async function guardarMarcaAction(_prev: FichaState, fd: FormData): Promise<FichaState> {
  await requirePlataforma();
  const slug = texto(fd, "slug");
  const logo = fd.get("logo");
  try {
    await guardarColores(slug, texto(fd, "fondo"), texto(fd, "acento"));
    if (fd.get("quitarLogo") === "on") {
      await quitarLogo(slug);
    } else if (logo instanceof File && logo.size > 0) {
      await subirLogo(slug, logo);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la marca." };
  }
  revalidatePath(`/panel/plataforma/${slug}`);
  return { ok: "Marca guardada. Puede tardar unos minutos en verse en la web." };
}
