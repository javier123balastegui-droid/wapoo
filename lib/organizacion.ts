import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReglasAgenda } from "@/lib/agenda-reglas";
import type { Moneda } from "@/lib/utils";

/**
 * Una organización es una academia que usa la plataforma (tabla
 * `organizaciones`). Junta lo que antes estaba escrito en el código para
 * Academia Demo: identidad, contacto, horarios, reglas de duración y
 * de reagenda, moneda y colores.
 *
 * La usan el bot (su texto de instrucciones y sus horarios) y el portal. Ver
 * docs/plantilla-vendible.md.
 */

/** Franja de atención de un día, en minutos desde medianoche. */
export type Franja = { apertura: number; cierre: number };

export type Organizacion = {
  id: string;
  slug: string;
  nombre: string;
  directora: string;
  materia: string;
  descripcion: string;
  instagramUrl: string;
  whatsappPublico: string;
  /** A dónde se transfiere la seña y a nombre de quién. */
  aliasPago: string;
  titularPago: string;
  /** Dirección del portal de alumnos. */
  urlPortal: string;
  logoUrl: string;
  colores: Record<string, string>;
  zonaHoraria: string;
  moneda: string;
  locale: string;
  /** Índice 0 = domingo … 6 = sábado; null = ese día no hay clases. */
  horariosAtencion: (Franja | null)[];
  panelApertura: number;
  panelCierre: number;
  duracionMinima: number;
  pasoDuracion: number;
  slotGranularidad: number;
  pausaSugerida: number;
  reagendaAnticipacionMin: number;
  reagendaToleranciaMin: number;
  activa: boolean;
};

function franja(valor: unknown): Franja | null {
  if (!valor || typeof valor !== "object") return null;
  const { apertura, cierre } = valor as Record<string, unknown>;
  if (typeof apertura !== "number" || typeof cierre !== "number") return null;
  if (apertura < 0 || cierre > 1440 || apertura >= cierre) return null;
  return { apertura, cierre };
}

function colores(valor: unknown): Record<string, string> {
  if (!valor || typeof valor !== "object") return {};
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

function aOrganizacion(fila: Record<string, unknown>): Organizacion {
  const horarios = (fila.horarios_atencion ?? {}) as Record<string, unknown>;
  return {
    id: String(fila.id),
    slug: String(fila.slug),
    nombre: String(fila.nombre),
    directora: String(fila.directora ?? ""),
    materia: String(fila.materia ?? ""),
    descripcion: String(fila.descripcion ?? ""),
    instagramUrl: String(fila.instagram_url ?? ""),
    whatsappPublico: String(fila.whatsapp_publico ?? ""),
    aliasPago: String(fila.alias_pago ?? ""),
    titularPago: String(fila.titular_pago ?? ""),
    urlPortal: String(fila.url_portal ?? ""),
    logoUrl: String(fila.logo_url ?? ""),
    colores: colores(fila.colores),
    zonaHoraria: String(fila.zona_horaria),
    moneda: String(fila.moneda),
    locale: String(fila.locale),
    horariosAtencion: Array.from({ length: 7 }, (_, dow) => franja(horarios[String(dow)])),
    panelApertura: Number(fila.panel_apertura),
    panelCierre: Number(fila.panel_cierre),
    duracionMinima: Number(fila.duracion_minima),
    pasoDuracion: Number(fila.paso_duracion),
    slotGranularidad: Number(fila.slot_granularidad),
    pausaSugerida: Number(fila.pausa_sugerida),
    reagendaAnticipacionMin: Number(fila.reagenda_anticipacion_min),
    reagendaToleranciaMin: Number(fila.reagenda_tolerancia_min),
    activa: fila.activa !== false,
  };
}

/** Organización por slug (ej: "academia-demo"). null si no existe.
 *  Tira si la base falla, para no confundir un error con "no existe". */
export async function getOrganizacionPorSlug(slug: string): Promise<Organizacion | null> {
  const db = createAdminClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { data, error } = await db
    .from("organizaciones")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aOrganizacion(data) : null;
}

/**
 * Organización por id. Se recuerda unos minutos en memoria porque el bot la
 * lee en cada mensaje (horarios, instrucciones). Solo se recuerda si la
 * lectura salió bien: un error no queda guardado (ver lib/auth.ts). Tira si
 * la base falla o si no existe: sin academia el bot no puede seguir.
 */
const MINUTOS_EN_MEMORIA = 5;
const porId = new Map<string, { org: Organizacion; vence: number }>();

export async function getOrganizacion(orgId: string): Promise<Organizacion> {
  const guardada = porId.get(orgId);
  if (guardada && guardada.vence > Date.now()) return guardada.org;
  const db = createAdminClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { data, error } = await db
    .from("organizaciones")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No existe la organización ${orgId}`);
  const org = aOrganizacion(data);
  porId.set(orgId, { org, vence: Date.now() + MINUTOS_EN_MEMORIA * 60_000 });
  return org;
}

// ── Horarios de atención ──

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** Franja de atención al alumno de un día (0 = domingo … 6 = sábado), o null
 *  si ese día no hay clases. Reemplaza a ventanaDelDia de lib/constants. */
export function ventanaDeOrg(org: Organizacion, dow: number): Franja | null {
  return org.horariosAtencion[dow] ?? null;
}

/** Días de la semana con clases (0 = domingo … 6 = sábado). */
export function diasConClase(org: Organizacion): number[] {
  return org.horariosAtencion.flatMap((f, dow) => (f ? [dow] : []));
}

function hora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : String(h);
}

/**
 * Los horarios en palabras, para el bot: "lunes a viernes de 14 a 22 hs, y
 * sábados de 8 a 21 hs (los domingos no hay clases)". Junta los días seguidos
 * que tienen la misma franja.
 */
export function horariosEnPalabras(org: Organizacion): string {
  // Lunes primero: es como se dice ("de lunes a sábado").
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const tramos: { desde: number; hasta: number; franja: Franja }[] = [];
  for (const dow of orden) {
    const f = org.horariosAtencion[dow];
    if (!f) continue;
    const ultimo = tramos[tramos.length - 1];
    const seguido = ultimo && orden.indexOf(dow) === orden.indexOf(ultimo.hasta) + 1;
    if (seguido && ultimo.franja.apertura === f.apertura && ultimo.franja.cierre === f.cierre) {
      ultimo.hasta = dow;
    } else {
      tramos.push({ desde: dow, hasta: dow, franja: f });
    }
  }
  if (!tramos.length) return "(no hay horarios cargados: no los inventes, consultalos con consultar_a_la_directora)";
  const partes = tramos.map((t) => {
    const dias =
      t.desde === t.hasta
        ? DIAS_PLURAL[t.desde]
        : orden.indexOf(t.hasta) === orden.indexOf(t.desde) + 1
          ? `${DIAS[t.desde]} y ${DIAS[t.hasta]}`
          : `${DIAS[t.desde]} a ${DIAS[t.hasta]}`;
    return `${dias} de ${hora(t.franja.apertura)} a ${hora(t.franja.cierre)} hs`;
  });
  const texto = partes.length > 1 ? `${partes.slice(0, -1).join(", ")}, y ${partes.at(-1)}` : partes[0];
  const sinClase = orden.filter((d) => !org.horariosAtencion[d]).map((d) => DIAS_PLURAL[d]);
  if (!sinClase.length) return texto;
  const cerrado = sinClase.length > 1 ? `${sinClase.slice(0, -1).join(", ")} y ${sinClase.at(-1)}` : sinClase[0];
  return `${texto} (los ${cerrado} no hay clases)`;
}

/** Minutos de anticipación con los que reagendar conserva la seña: el mínimo
 *  menos la tolerancia (hoy 3 h con 15 min de tolerancia → 165 min). */
export function anticipacionReagenda(org: Organizacion): number {
  return Math.max(0, org.reagendaAnticipacionMin - org.reagendaToleranciaMin);
}

/**
 * La academia "por defecto": la usan los scripts de prueba, el diagnóstico
 * y la web en desarrollo (localhost), que no tienen un dominio del que
 * deducirla. En producción, nada de lo que atiende a alumnos o al equipo la
 * usa: el bot va por el número de WhatsApp, las páginas por su dominio y el
 * panel por la sesión.
 *
 * Se recuerda solo si la lectura salió bien: un error no queda guardado.
 */
const SLUG_POR_DEFECTO = "academia-demo";
let idPorDefecto: string | null = null;

export async function orgPorDefecto(): Promise<string> {
  if (idPorDefecto) return idPorDefecto;
  const org = await getOrganizacionPorSlug(SLUG_POR_DEFECTO);
  if (!org) throw new Error(`No existe la organización ${SLUG_POR_DEFECTO}`);
  idPorDefecto = org.id;
  return org.id;
}

/** Las academias activas: id y slug. Para lo que corre para todas (crons). */
export async function listarOrganizacionesActivas(): Promise<{ id: string; slug: string }[]> {
  const db = createAdminClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { data, error } = await db
    .from("organizaciones")
    .select("id, slug")
    .eq("activa", true)
    .order("slug");
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => ({ id: String(o.id), slug: String(o.slug) }));
}

/**
 * Corre una tarea para cada academia activa, todas a la vez, y devuelve el
 * resultado de cada una por su slug. Lo que falla en una academia no frena a
 * las demás: queda como { error } en su resultado y en el log.
 */
export async function paraCadaAcademia<T>(
  nombre: string,
  tarea: (orgId: string) => Promise<T>,
): Promise<Record<string, T | { error: string }>> {
  const orgs = await listarOrganizacionesActivas();
  const resultados = await Promise.allSettled(orgs.map((o) => tarea(o.id)));
  const salida: Record<string, T | { error: string }> = {};
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      salida[orgs[i].slug] = r.value;
    } else {
      const error = r.reason instanceof Error ? r.reason.message : "Error desconocido";
      console.error(`[${nombre}] falló para ${orgs[i].slug}:`, r.reason);
      salida[orgs[i].slug] = { error };
    }
  });
  return salida;
}

// ── La academia de una página pública, por su dominio ──

/** "WWW.Academia.com:443" → "academia.com". */
export function normalizarDominio(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
}

const porDominio = new Map<string, { org: Organizacion | null; vence: number }>();

/** La academia de un dominio, o null si no es de ninguna. Se recuerda unos
 *  minutos (también el "no es de ninguna"); un error de la base tira y no
 *  queda guardado. */
export async function orgPorDominio(host: string): Promise<Organizacion | null> {
  const dominio = normalizarDominio(host);
  if (!dominio) return null;
  const guardado = porDominio.get(dominio);
  if (guardado && guardado.vence > Date.now()) return guardado.org;
  const db = createAdminClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { data, error } = await db
    .from("organizacion_dominios")
    .select("organizaciones(*)")
    .eq("dominio", dominio)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const fila = (data?.organizaciones ?? null) as Record<string, unknown> | null;
  const org = fila && fila.activa !== false ? aOrganizacion(fila) : null;
  porDominio.set(dominio, { org, vence: Date.now() + MINUTOS_EN_MEMORIA * 60_000 });
  return org;
}


/** Lo que necesita el componente de marca (components/brand/wordmark.tsx). */
export function marcaDe(org: Organizacion): { nombre: string; directora: string; logoUrl: string } {
  return { nombre: org.nombre, directora: org.directora, logoUrl: org.logoUrl };
}

/**
 * Los colores de la academia como variables de CSS, para pisar las de
 * globals.css (bg-cream, text-ink…). Solo pasan nombres simples y colores
 * hexadecimales: lo que viene de la base no se mete en el CSS sin revisar.
 */
export function cssDeColores(org: Organizacion): string {
  const reglas = Object.entries(org.colores)
    .filter(([nombre, valor]) => /^[a-z0-9-]+$/.test(nombre) && /^#[0-9a-f]{3,8}$/i.test(valor))
    .map(([nombre, valor]) => `--color-${nombre}:${valor};`);
  return reglas.length ? `:root{${reglas.join("")}}` : "";
}

/** "https://www.instagram.com/academia_demo" -> "academia_demo". */
export function usuarioDeInstagram(url: string): string {
  return url.replace(/\/+$/, "").split("/").pop()?.replace(/^@/, "") ?? "";
}

/** Las reglas de agenda de la academia (duraciones y franja del panel). */
export function reglasDe(org: Organizacion): ReglasAgenda {
  const largos = org.horariosAtencion.flatMap((f) => (f ? [f.cierre - f.apertura] : []));
  return {
    duracionMinima: org.duracionMinima,
    pasoDuracion: org.pasoDuracion,
    granularidad: org.slotGranularidad,
    pausa: org.pausaSugerida,
    apertura: org.panelApertura,
    cierre: org.panelCierre,
    duracionMaxima: largos.length ? Math.max(...largos) : org.duracionMinima,
  };
}

/** La moneda de la academia, para formatMoneda y montoTexto (lib/utils.ts). */
export function monedaDe(org: Organizacion): Moneda {
  return { moneda: org.moneda, locale: org.locale };
}

/** La zona horaria de la academia (para ahoraEn y hoyEn de lib/fechas.ts). */
export async function zonaDe(orgId: string): Promise<string> {
  return (await getOrganizacion(orgId)).zonaHoraria;
}
