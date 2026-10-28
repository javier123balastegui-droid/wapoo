import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";
import { enlacesFirmados, type Adjunto } from "@/lib/bot/comprobantes";

/**
 * Persistencia del historial de conversaciones del bot de WhatsApp.
 *
 * Usa SIEMPRE el cliente admin (service key) porque estos datos los toca solo
 * el backend del bot, nunca el navegador. La conversación se identifica por
 * `contacto` (hoy: un identificador de prueba; mañana: el número de WhatsApp).
 */

export type RolMensaje = "user" | "assistant";

export type MensajeBot = {
  rol: RolMensaje;
  contenido: string;
  /** Foto o PDF que mandó el alumno en este mensaje (normalmente un comprobante). */
  adjunto?: Adjunto | null;
  /** Solo en respuestas del bot: lo que hizo en ese turno (herramientas), una
   *  por línea. Se le vuelve a mostrar para que no repita acciones. */
  acciones?: string | null;
  /** Cuándo se guardó (ISO). Sirve para marcarle al bot los saltos de tiempo. */
  creadoEn?: string;
};

/** Quién escribió, del lado del negocio: el bot o una persona del equipo. */
export type OrigenMensaje = "BOT" | "HUMANO";

/** Horas que WhatsApp deja para contestar texto libre desde el último mensaje
 *  del alumno. Pasado ese plazo solo se puede mandar una plantilla aprobada. */
export const HORAS_VENTANA_WHATSAPP = 24;

export type Conversacion = {
  id: string;
  contacto: string;
  estado: "BOT" | "HUMANO";
};

/** Devuelve la conversación de un contacto; la crea si no existe. */
export async function getOrCreateConversacion(
  orgId: string,
  contacto: string,
): Promise<Conversacion> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const { data: existente, error: errBuscar } = await db
    .from("bot_conversaciones")
    .select("id, contacto, estado")
    .eq("contacto", contacto)
    .maybeSingle();
  if (errBuscar) throw new Error(errBuscar.message);
  if (existente) return existente as Conversacion;

  const fila = {
    id: `conv-${Date.now()}`,
    contacto,
    estado: "BOT" as const,
  };
  const { error: errCrear } = await db.from("bot_conversaciones").insert(fila);
  if (errCrear) throw new Error(errCrear.message);
  return fila;
}

/** Trae el historial de mensajes de una conversación, del más viejo al más nuevo. */
export async function getMensajes(
  orgId: string,
  conversacionId: string,
): Promise<MensajeBot[]> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const leer = (columnas: string) =>
    db
      .from("bot_mensajes")
      .select(columnas)
      .eq("conversacion_id", conversacionId)
      .order("creado_en", { ascending: true });
  let { data, error } = await leer(
    "rol, contenido, adjunto_path, adjunto_tipo, acciones, creado_en",
  );
  // Si todavía no se corrió la migración de "acciones", seguimos sin ella en
  // vez de dejar al bot mudo.
  if (error?.message.includes("acciones")) {
    ({ data, error } = await leer("rol, contenido, adjunto_path, adjunto_tipo, creado_en"));
  }
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, string | null>[]).map((m) => ({
    rol: m.rol as RolMensaje,
    contenido: m.contenido ?? "",
    adjunto: m.adjunto_path
      ? { path: m.adjunto_path, tipo: m.adjunto_tipo ?? "" }
      : null,
    acciones: m.acciones ?? null,
    creadoEn: m.creado_en ?? undefined,
  }));
}

/**
 * Guarda un mensaje en el historial.
 *
 * `origen` distingue quién escribió del lado del negocio: el bot o la
 * directora. Los dos van con rol "assistant" a propósito, para que cuando el
 * bot retome el control lea también lo que contestó la persona y no repita ni
 * se contradiga. El origen es solo para mostrarlo distinto en el panel.
 */
export async function guardarMensaje(
  orgId: string,
  conversacionId: string,
  rol: RolMensaje,
  contenido: string,
  origen: OrigenMensaje = "BOT",
  adjunto: Adjunto | null = null,
  acciones: string[] = [],
): Promise<string> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const id = crypto.randomUUID();
  const { error } = await db.from("bot_mensajes").insert({
    id,
    conversacion_id: conversacionId,
    rol,
    contenido,
    origen,
    ...(adjunto
      ? { adjunto_path: adjunto.path, adjunto_tipo: adjunto.tipo }
      : {}),
    ...(acciones.length ? { acciones: acciones.join("\n") } : {}),
  });
  if (error) throw new Error(error.message);

  // Marca la conversación como actualizada (para ordenarlas por actividad).
  await db
    .from("bot_conversaciones")
    .update({ actualizado_en: new Date().toISOString() })
    .eq("id", conversacionId);

  return id;
}

/**
 * ¿Este es el último mensaje que mandó el alumno? Sirve para contestar una
 * sola vez cuando escribe varios mensajes seguidos: cada uno espera un rato y
 * solo el más nuevo responde, leyendo todos juntos. El desempate por id hace
 * que siempre haya exactamente un "último", aunque dos lleguen a la vez.
 */
export async function esElUltimoDelAlumno(
  orgId: string,
  conversacionId: string,
  mensajeId: string,
): Promise<boolean> {
  const db = dbDeOrg(orgId);
  if (!db) return true;
  const { data } = await db
    .from("bot_mensajes")
    .select("id")
    .eq("conversacion_id", conversacionId)
    .eq("rol", "user")
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !data || data.id === mensajeId;
}

/**
 * Anota que un mensaje de WhatsApp ya se recibió. Devuelve false si ya estaba
 * anotado: Meta reenvía el mismo mensaje cuando cree que no le contestamos, y
 * sin esto el bot respondería dos veces.
 *
 * Si la anotación falla por otro motivo, deja pasar el mensaje: es preferible
 * una respuesta repetida a una alumna sin respuesta.
 */
export async function reclamarMensajeEntrante(orgId: string, wamid: string): Promise<boolean> {
  const db = dbDeOrg(orgId);
  if (!db) return true;
  const { error } = await db.from("bot_mensajes_recibidos").insert({ wamid });
  if (!error) return true;
  if (error.code === "23505") return false; // ya estaba: es un reenvío de Meta
  console.error("[whatsapp] no se pudo anotar el mensaje recibido:", error.message);
  return true;
}

/** Cambia el modo de una conversación: BOT (el bot responde) o HUMANO (queda en
 *  manos de una persona; el bot deja de responder). */
export async function setEstadoConversacion(
  orgId: string,
  contacto: string,
  estado: "BOT" | "HUMANO",
): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  await db
    .from("bot_conversaciones")
    .update({ estado })
    .eq("contacto", contacto);
}

/** Igual que setEstadoConversacion pero por id (lo usa el panel de la directora). */
export async function setEstadoConversacionPorId(
  orgId: string,
  id: string,
  estado: "BOT" | "HUMANO",
): Promise<void> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  await db.from("bot_conversaciones").update({ estado }).eq("id", id);
}

// ── Lecturas para el panel de la directora ──

export type ConversacionResumen = {
  id: string;
  contacto: string;
  estado: "BOT" | "HUMANO";
  actualizadoEn: string;
  ultimoMensaje: string | null;
};

/** Lista las conversaciones del bot, de la más reciente a la más vieja, con un
 *  preview del último mensaje. */
export async function listarConversacionesBot(orgId: string): Promise<ConversacionResumen[]> {
  const db = dbDeOrg(orgId);
  if (!db) return [];

  const { data: convs } = await db
    .from("bot_conversaciones")
    .select("id, contacto, estado, actualizado_en")
    .order("actualizado_en", { ascending: false });
  const lista = convs ?? [];
  if (lista.length === 0) return [];

  const ids = lista.map((c) => c.id);
  const { data: msgs } = await db
    .from("bot_mensajes")
    .select("conversacion_id, contenido, creado_en")
    .in("conversacion_id", ids)
    .order("creado_en", { ascending: false });
  const ultimoPorConv = new Map<string, string>();
  for (const m of msgs ?? [])
    if (!ultimoPorConv.has(m.conversacion_id))
      ultimoPorConv.set(m.conversacion_id, m.contenido);

  return lista.map((c) => ({
    id: c.id,
    contacto: c.contacto,
    estado: c.estado,
    actualizadoEn: c.actualizado_en,
    ultimoMensaje: ultimoPorConv.get(c.id) ?? null,
  }));
}

/** Un mensaje tal como lo muestra el panel (con quién lo escribió y cuándo). */
export type MensajePanel = {
  rol: RolMensaje;
  contenido: string;
  origen: OrigenMensaje;
  creadoEn: string;
  /** Comprobante que mandó el alumno, con un enlace temporal para verlo. */
  adjunto: { url: string; tipo: string } | null;
};

export type ConversacionDetalle = {
  id: string;
  contacto: string;
  estado: "BOT" | "HUMANO";
  mensajes: MensajePanel[];
  /** Último mensaje del alumno (ISO), o null si nunca escribió. */
  ultimoEntranteEn: string | null;
  /** WhatsApp solo acepta texto libre dentro de las 24 h posteriores al último
   *  mensaje del alumno. Si está cerrada, la directora no puede escribirle. */
  ventanaAbierta: boolean;
};

/** Trae una conversación con todos sus mensajes, del más viejo al más nuevo.
 *  Incluye enlaces temporales a los comprobantes: llamar solo después de
 *  requireAdmin. */
export async function getConversacionBotDetalle(
  orgId: string,
  id: string,
): Promise<ConversacionDetalle | null> {
  const db = dbDeOrg(orgId);
  if (!db) return null;

  const { data: conv } = await db
    .from("bot_conversaciones")
    .select("id, contacto, estado")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return null;

  const { data: msgs, error } = await db
    .from("bot_mensajes")
    .select("rol, contenido, origen, creado_en, adjunto_path, adjunto_tipo")
    .eq("conversacion_id", id)
    .order("creado_en", { ascending: true });
  // Mejor un error a la vista que una conversación que aparece vacía.
  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`);

  const filas = msgs ?? [];
  const enlaces = await enlacesFirmados(
    filas.map((m) => m.adjunto_path).filter(Boolean),
  );
  // El último mensaje del alumno es el que abre (o no) la ventana de 24 h.
  const ultimoEntrante = [...filas]
    .reverse()
    .find((m) => m.rol === "user");
  const ultimoEntranteEn = ultimoEntrante?.creado_en ?? null;
  const ventanaAbierta = ultimoEntranteEn
    ? Date.now() - new Date(ultimoEntranteEn).getTime() <
      HORAS_VENTANA_WHATSAPP * 60 * 60 * 1000
    : false;

  return {
    id: conv.id,
    contacto: conv.contacto,
    estado: conv.estado,
    mensajes: filas.map((m) => ({
      rol: m.rol,
      contenido: m.contenido,
      origen: (m.origen ?? "BOT") as OrigenMensaje,
      creadoEn: m.creado_en,
      adjunto:
        m.adjunto_path && enlaces.has(m.adjunto_path)
          ? { url: enlaces.get(m.adjunto_path)!, tipo: m.adjunto_tipo }
          : null,
    })),
    ultimoEntranteEn,
    ventanaAbierta,
  };
}

/**
 * Deja anotado en la charla del alumno un mensaje automático que le mandó el
 * bot (recordatorio, consulta post-clase, consulta de reagenda). Las
 * plantillas salen por fuera de la charla, y sin esto, cuando el alumno
 * contestaba ("bien, gracias!"), el bot no sabía a qué. Nunca tira error: es
 * contexto, no puede frenar un envío.
 */
export async function anotarEnvioAutomatico(
  orgId: string,
  telefono: string,
  descripcion: string,
): Promise<void> {
  try {
    const contacto = telefono.replace(/\D/g, "");
    if (!contacto) return;
    const conversacion = await getOrCreateConversacion(orgId, contacto);
    await guardarMensaje(
      orgId,
      conversacion.id,
      "assistant",
      `[Mensaje automático que le mandamos: ${descripcion}]`,
      "BOT",
    );
  } catch (e) {
    console.error("[bot] no pude anotar el mensaje automático:", e instanceof Error ? e.message : e);
  }
}
