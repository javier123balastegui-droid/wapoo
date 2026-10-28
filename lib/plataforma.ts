import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbDeOrg } from "@/lib/supabase/org";
import { normalizarDominio, getOrganizacionPorSlug } from "@/lib/organizacion";
import {
  PATRON_HEX,
  FONDO_POR_DEFECTO,
  ACENTO_POR_DEFECTO,
  derivarPaleta,
  problemaDeContraste,
} from "@/lib/colores";

/**
 * Administración de la PLATAFORMA: dar de alta academias y conectarles el
 * dominio y el número de WhatsApp.
 *
 * Ve y toca todas las academias, así que va con el cliente admin pelado. Todo
 * lo que llega desde la web pasa antes por requirePlataforma()
 * (lib/plataforma-acceso.ts): solo las cuentas de la tabla plataforma_admins.
 * Ser ADMIN de una academia no alcanza.
 */

function db() {
  const cliente = createAdminClient();
  if (!cliente) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return cliente;
}

// ── Lectura ──

export type ResumenAcademia = {
  id: string;
  slug: string;
  nombre: string;
  materia: string;
  activa: boolean;
  dominios: string[];
  whatsapp: { numeroVisible: string; terminaEn: string; cuentaPropia: boolean } | null;
  admins: { nombre: string; email: string; activo: boolean }[];
  modoBot: string;
};

/** Todas las academias, con lo que les falta para atender. */
export async function listarAcademias(): Promise<ResumenAcademia[]> {
  const c = db();
  const [orgs, dominios, numeros, admins, configs] = await Promise.all([
    c.from("organizaciones").select("id, slug, nombre, materia, activa").order("creado_en"),
    c.from("organizacion_dominios").select("dominio, organizacion_id").order("dominio"),
    c.from("whatsapp_numeros").select("organizacion_id, phone_number_id, numero_visible, token_secreto"),
    c.from("profiles").select("organizacion_id, nombre, email, activo").eq("rol", "ADMIN"),
    c.from("bot_config").select("organizacion_id, modo"),
  ]);
  for (const r of [orgs, dominios, numeros, admins, configs]) {
    if (r.error) throw new Error(r.error.message);
  }
  return (orgs.data ?? []).map((o) => {
    const numero = (numeros.data ?? []).find((n) => n.organizacion_id === o.id);
    return {
      id: String(o.id),
      slug: String(o.slug),
      nombre: String(o.nombre),
      materia: String(o.materia ?? ""),
      activa: o.activa !== false,
      // La más corta primero: es la principal (el alias largo de Vercel, o
      // un subdominio técnico, van después).
      dominios: (dominios.data ?? [])
        .filter((d) => d.organizacion_id === o.id)
        .map((d) => String(d.dominio))
        .sort((x, y) => x.length - y.length || x.localeCompare(y)),
      whatsapp: numero
        ? {
            numeroVisible: String(numero.numero_visible ?? ""),
            terminaEn: String(numero.phone_number_id).slice(-4),
            cuentaPropia: Boolean(numero.token_secreto),
          }
        : null,
      admins: (admins.data ?? [])
        .filter((a) => a.organizacion_id === o.id)
        .map((a) => ({ nombre: String(a.nombre ?? ""), email: String(a.email ?? ""), activo: a.activo !== false })),
      modoBot: String((configs.data ?? []).find((b) => b.organizacion_id === o.id)?.modo ?? "SIN CONFIGURAR"),
    };
  });
}

export async function getAcademia(slug: string): Promise<ResumenAcademia | null> {
  return (await listarAcademias()).find((a) => a.slug === slug) ?? null;
}

// ── Validaciones ──

export const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Identificadores que no puede tener una academia: son pantallas de
 *  Plataforma (/panel/plataforma/nueva, /panel/plataforma/cobros). */
export const SLUGS_RESERVADOS = ["nueva", "cobros"];

/** "Matemática Fácil" → "matematica-facil". */
export function slugDe(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normaliza y valida un dominio; null si no parece uno. */
export function dominioValido(texto: string): string | null {
  const d = normalizarDominio(texto.replace(/^https?:\/\//, "").split("/")[0] ?? "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d) ? d : null;
}

// ── Alta ──

export type Franja = { apertura: number; cierre: number };

/** Lo que se puede cambiar de una academia ya creada. */
export type DatosEditables = {
  nombre: string;
  materia: string;
  directora: string;
  descripcion: string;
  aliasPago: string;
  titularPago: string;
  instagramUrl: string;
  whatsappPublico: string;
  /** Índice 0 = domingo … 6 = sábado; null = cerrado. */
  horarios: (Franja | null)[];
  /** Anticipación con la que reagendar conserva la seña, y su tolerancia. */
  reagendaAnticipacionMin: number;
  reagendaToleranciaMin: number;
  /** Duración mínima de una clase y de cuánto en cuánto crece (minutos). */
  duracionMinima: number;
  pasoDuracion: number;
  /** Moneda, forma de escribir números y zona horaria (salen del país). */
  moneda: string;
  locale: string;
  zonaHoraria: string;
};

export type DatosAcademia = DatosEditables & {
  slug: string;
  dominio: string;
  /** El formulario siempre lo pide. Es opcional acá para poder probar el
   *  alta sin crear cuentas (scripts). */
  admin?: { nombre: string; email: string; password: string };
};

/**
 * Da de alta una academia lista para configurar: su fila, su dominio, la
 * configuración del bot APAGADA (no atiende a nadie hasta que la prendan),
 * los precios en cero y su primer administrador.
 *
 * Si algo falla a mitad de camino, deshace lo que ya había creado: no quedan
 * academias a medio armar.
 */
/** Los datos editables como columnas de organizaciones. */
function columnas(d: DatosEditables) {
  return {
    nombre: d.nombre,
    materia: d.materia,
    directora: d.directora,
    descripcion: d.descripcion,
    alias_pago: d.aliasPago,
    titular_pago: d.titularPago,
    instagram_url: d.instagramUrl,
    whatsapp_publico: d.whatsappPublico,
    horarios_atencion: Object.fromEntries(
      d.horarios.flatMap((f, dow) => (f ? [[String(dow), f]] : [])),
    ),
    reagenda_anticipacion_min: d.reagendaAnticipacionMin,
    reagenda_tolerancia_min: d.reagendaToleranciaMin,
    duracion_minima: d.duracionMinima,
    paso_duracion: d.pasoDuracion,
    moneda: d.moneda,
    locale: d.locale,
    zona_horaria: d.zonaHoraria,
  };
}

export async function crearAcademia(d: DatosAcademia): Promise<{ slug: string }> {
  const c = db();
  const { data: org, error } = await c
    .from("organizaciones")
    .insert({ ...columnas(d), slug: d.slug, url_portal: `https://${d.dominio}/` })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.code === "23505" ? "Ya hay una academia con ese identificador." : error.message);
  }
  const orgId = String(org.id);
  let userId: string | null = null;

  try {
    const dominio = await c.from("organizacion_dominios").insert({ dominio: d.dominio, organizacion_id: orgId });
    if (dominio.error) {
      throw new Error(dominio.error.code === "23505" ? "Ese dominio ya es de otra academia." : dominio.error.message);
    }
    const dbOrg = dbDeOrg(orgId)!;
    for (const [tabla, fila] of [
      ["bot_config", { modo: "APAGADO" }],
      ["precios", {}],
    ] as const) {
      const r = await dbOrg.from(tabla).insert(fila);
      if (r.error) throw new Error(`${tabla}: ${r.error.message}`);
    }

    if (!d.admin) return { slug: d.slug };

    // Primer admin. La academia va en app_metadata (solo la escribe el
    // servidor): el trigger handle_new_user crea el perfil en ella, como
    // PROFE inactivo; acá se lo hace ADMIN activo.
    const { data: creado, error: errUsuario } = await c.auth.admin.createUser({
      email: d.admin.email,
      password: d.admin.password,
      email_confirm: true,
      user_metadata: { nombre: d.admin.nombre },
      app_metadata: { organizacion_id: orgId },
    });
    if (errUsuario || !creado.user) {
      throw new Error(
        /already|registered|exists/i.test(errUsuario?.message ?? "")
          ? "Ya existe una cuenta con el email del administrador."
          : `No se pudo crear el administrador: ${errUsuario?.message}`,
      );
    }
    userId = creado.user.id;
    const perfil = await dbOrg.from("profiles").upsert({
      id: userId,
      email: d.admin.email,
      nombre: d.admin.nombre,
      rol: "ADMIN",
      activo: true,
    });
    if (perfil.error) throw new Error(`perfil del administrador: ${perfil.error.message}`);

    return { slug: d.slug };
  } catch (e) {
    // Deshacer en orden: la cuenta (borra su perfil en cascada), las filas de
    // la academia y la academia.
    if (userId) await c.auth.admin.deleteUser(userId);
    const dbOrg = dbDeOrg(orgId)!;
    for (const tabla of ["profiles", "bot_config", "precios"]) {
      await dbOrg.from(tabla).delete().not("organizacion_id", "is", null);
    }
    await c.from("organizacion_dominios").delete().eq("organizacion_id", orgId);
    await c.from("organizaciones").delete().eq("id", orgId);
    throw e;
  }
}

// ── Edición ──

/** Los datos editables de una academia, para completar el formulario. */
export async function getDatosAcademia(slug: string): Promise<(DatosEditables & { slug: string }) | null> {
  const org = await getOrganizacionPorSlug(slug);
  if (!org) return null;
  return {
    slug: org.slug,
    nombre: org.nombre,
    materia: org.materia,
    directora: org.directora,
    descripcion: org.descripcion,
    aliasPago: org.aliasPago,
    titularPago: org.titularPago,
    instagramUrl: org.instagramUrl,
    whatsappPublico: org.whatsappPublico,
    horarios: org.horariosAtencion,
    reagendaAnticipacionMin: org.reagendaAnticipacionMin,
    reagendaToleranciaMin: org.reagendaToleranciaMin,
    duracionMinima: org.duracionMinima,
    pasoDuracion: org.pasoDuracion,
    moneda: org.moneda,
    locale: org.locale,
    zonaHoraria: org.zonaHoraria,
  };
}

/** Guarda los datos editables. El servidor recuerda cada academia unos
 *  minutos (getOrganizacion, orgPorDominio): el cambio puede tardar eso en
 *  verse en el bot y en la web. */
export async function actualizarAcademia(slug: string, d: DatosEditables): Promise<void> {
  const { data, error } = await db()
    .from("organizaciones")
    .update({ ...columnas(d), actualizado_en: new Date().toISOString() })
    .eq("slug", slug)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No existe esa academia.");
}

// ── Ficha de una academia ──

async function idDe(slug: string): Promise<string> {
  const { data, error } = await db().from("organizaciones").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error("No existe esa academia.");
  return String(data.id);
}

export async function agregarDominio(slug: string, dominio: string): Promise<void> {
  const { error } = await db()
    .from("organizacion_dominios")
    .insert({ dominio, organizacion_id: await idDe(slug) });
  if (error) {
    throw new Error(error.code === "23505" ? "Ese dominio ya está registrado." : error.message);
  }
}

export async function quitarDominio(slug: string, dominio: string): Promise<void> {
  const { error } = await db()
    .from("organizacion_dominios")
    .delete()
    .eq("dominio", dominio)
    .eq("organizacion_id", await idDe(slug));
  if (error) throw new Error(error.message);
}

/** Conecta (o cambia) el número de WhatsApp. Sin token ni secreto, usa los
 *  de la cuenta de Meta de la plataforma; con ellos, se guardan cifrados. */
export async function guardarWhatsApp(
  slug: string,
  w: { phoneNumberId: string; numeroVisible: string; token?: string; appSecret?: string },
): Promise<void> {
  const orgId = await idDe(slug);
  // guardar_whatsapp_numero movería el número de academia sin avisar: acá
  // se frena antes.
  const { data: duenio } = await db()
    .from("whatsapp_numeros")
    .select("organizacion_id")
    .eq("phone_number_id", w.phoneNumberId)
    .maybeSingle();
  if (duenio && duenio.organizacion_id !== orgId) throw new Error("Ese número ya es de otra academia.");
  const { error } = await db().rpc("guardar_whatsapp_numero", {
    p_org: orgId,
    p_phone_number_id: w.phoneNumberId,
    p_numero_visible: w.numeroVisible,
    p_token: w.token || null,
    p_app_secret: w.appSecret || null,
  });
  if (error) {
    throw new Error(error.code === "23505" ? "Ese número ya es de otra academia." : error.message);
  }
}

/** Una academia inactiva no atiende: su dominio da "no encontrado" y los
 *  crons la saltean, y su número de WhatsApp deja de atender (puede tardar
 *  unos minutos: el servidor recuerda los números un rato). Sus datos quedan. */
export async function setAcademiaActiva(slug: string, activa: boolean): Promise<void> {
  const orgId = await idDe(slug);
  const { error } = await db().from("organizaciones").update({ activa }).eq("id", orgId);
  if (error) throw new Error(error.message);
  // Y su número: el webhook busca el número, no la academia. Sin esto, el
  // bot de una academia desactivada seguiría contestando.
  const num = await db().from("whatsapp_numeros").update({ activo: activa }).eq("organizacion_id", orgId);
  if (num.error) throw new Error(num.error.message);
}

// ── Marca: logo y colores ──

export type MarcaAcademia = {
  logoUrl: string;
  fondo: string;
  acento: string;
};

export async function getMarcaAcademia(slug: string): Promise<MarcaAcademia | null> {
  const org = await getOrganizacionPorSlug(slug);
  if (!org) return null;
  return {
    logoUrl: org.logoUrl,
    fondo: PATRON_HEX.test(org.colores.canvas ?? "") ? org.colores.canvas : FONDO_POR_DEFECTO,
    acento: PATRON_HEX.test(org.colores.blush ?? "") ? org.colores.blush : ACENTO_POR_DEFECTO,
  };
}

const BUCKET_LOGOS = "logos";
const MAX_BYTES_LOGO = 2 * 1024 * 1024;
const EXTENSION_LOGO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Guarda los colores. Si son los mismos que ya tenía, no toca nada: así una
 * academia con tonos elegidos a mano (Anatomía) los conserva tal cual. Si
 * cambian, se recalculan sus variantes (lib/colores.ts) y se mezclan con el
 * resto de sus colores.
 */
export async function guardarColores(slug: string, fondo: string, acento: string): Promise<void> {
  if (!PATRON_HEX.test(fondo) || !PATRON_HEX.test(acento)) throw new Error("Los colores tienen que ser del tipo #a1b2c3.");
  const problema = problemaDeContraste(fondo, acento);
  if (problema?.grave) throw new Error(problema.mensaje);
  const org = await getOrganizacionPorSlug(slug);
  if (!org) throw new Error("No existe esa academia.");
  const actual = await getMarcaAcademia(slug);
  if (actual && actual.fondo.toLowerCase() === fondo.toLowerCase() && actual.acento.toLowerCase() === acento.toLowerCase()) {
    return;
  }
  const { error } = await db()
    .from("organizaciones")
    .update({ colores: { ...org.colores, ...derivarPaleta(fondo, acento) }, actualizado_en: new Date().toISOString() })
    .eq("id", org.id);
  if (error) throw new Error(error.message);
}

/** Sube el logo al depósito público y lo deja como logo de la academia.
 *  Borra los logos anteriores de la academia. */
export async function subirLogo(slug: string, archivo: File): Promise<string> {
  const extension = EXTENSION_LOGO[archivo.type];
  if (!extension) throw new Error("El logo tiene que ser PNG, JPG o WebP.");
  if (archivo.size > MAX_BYTES_LOGO) throw new Error("El logo pesa más de 2 MB. Achicalo y probá de nuevo.");
  const orgId = await idDe(slug);
  const c = db();
  const ruta = `${orgId}/logo-${Date.now()}.${extension}`;
  const subida = await c.storage
    .from(BUCKET_LOGOS)
    .upload(ruta, await archivo.arrayBuffer(), { contentType: archivo.type, upsert: false });
  if (subida.error) throw new Error(`No se pudo subir el logo: ${subida.error.message}`);
  const url = c.storage.from(BUCKET_LOGOS).getPublicUrl(ruta).data.publicUrl;
  const { error } = await c
    .from("organizaciones")
    .update({ logo_url: url, actualizado_en: new Date().toISOString() })
    .eq("id", orgId);
  if (error) {
    await c.storage.from(BUCKET_LOGOS).remove([ruta]);
    throw new Error(error.message);
  }
  await borrarLogosViejos(orgId, ruta);
  return url;
}

/** Saca el logo: la web muestra la inicial de la academia. */
export async function quitarLogo(slug: string): Promise<void> {
  const orgId = await idDe(slug);
  const { error } = await db()
    .from("organizaciones")
    .update({ logo_url: "", actualizado_en: new Date().toISOString() })
    .eq("id", orgId);
  if (error) throw new Error(error.message);
  await borrarLogosViejos(orgId, null);
}

/** Borra del depósito los logos de la academia, menos el que está en uso.
 *  Nunca tira error: es limpieza. */
async function borrarLogosViejos(orgId: string, enUso: string | null): Promise<void> {
  try {
    const c = db();
    const { data } = await c.storage.from(BUCKET_LOGOS).list(orgId);
    const viejos = (data ?? []).map((f) => `${orgId}/${f.name}`).filter((r) => r !== enUso);
    if (viejos.length) await c.storage.from(BUCKET_LOGOS).remove(viejos);
  } catch (e) {
    console.error("[plataforma] no pude borrar logos viejos:", e instanceof Error ? e.message : e);
  }
}

/** ¿La web de la academia abre en ese dominio? Es la forma de saber si ya
 *  está agregado en Vercel y con el DNS apuntado. Nunca tira error. */
export async function dominioResponde(dominio: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${dominio}/`, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
