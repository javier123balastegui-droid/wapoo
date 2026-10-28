import "server-only";
import { dbDeOrg, type DbDeOrg } from "@/lib/supabase/org";
import { enviarPlantilla, PLANTILLAS } from "@/lib/bot/whatsapp";
import { nombreDiaLargo } from "@/lib/fechas";

/**
 * Aviso al profe cuando se agenda, reagenda o cancela una clase.
 *
 * Le manda por WhatsApp que su agenda de ese día cambió, junto con la lista de
 * las clases que le quedan ese día. Pensado para la etapa de UN solo profe: se
 * avisa siempre al único profe (rol PROFE con teléfono cargado). Cuando haya
 * más profes, se rutea por clase.
 *
 * Las clases de la DIRECTORA (Laura) no avisan al profe: si la clase que cambió
 * está asignada a un admin, no se manda nada.
 *
 * Usa la plantilla `aviso_profe_agenda` (WhatsApp exige plantilla para los
 * mensajes que el bot inicia). Las plantillas NO admiten saltos de línea en sus
 * variables, así que la lista va en una sola línea separada por " · ".
 *
 * Nunca tira error: si algo falla, lo loguea y sigue (no debe romper el agendado).
 */

/** Tope defensivo: Meta corta las variables de plantilla que son muy largas. */
const MAX_LISTA = 900;

function primerNombre(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}
function ddmm(iso: string): string {
  const [, mo, d] = iso.split("-");
  return `${d}/${mo}`;
}
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Arma la lista de clases del día en UNA línea: "10:00 Sofía · 18:00 grupo de 3".
 *
 * Nunca devuelve vacío: si el día quedó sin clases (por ejemplo, se canceló la
 * última), devuelve "sin clases". Meta rechaza el envío si una variable llega
 * vacía, así que este detalle no es cosmético.
 */
async function listaDelDia(db: DbDeOrg, fecha: string): Promise<string> {
  const { data: clases } = await db
    .from("clases")
    .select("id, inicio_min")
    .eq("fecha", fecha)
    .order("inicio_min");
  if (!clases || clases.length === 0) return "sin clases";

  const partes: string[] = [];
  for (const c of clases) {
    const { data: links } = await db
      .from("clase_alumnos")
      .select("alumno_id")
      .eq("clase_id", c.id);
    const ids = (links ?? []).map((l) => l.alumno_id);

    let quien: string;
    if (ids.length === 0) {
      quien = "sin alumnos";
    } else if (ids.length === 1) {
      const { data: al } = await db
        .from("alumnos")
        .select("nombre")
        .eq("id", ids[0])
        .maybeSingle();
      quien = primerNombre(al?.nombre ?? "") || "1 alumna";
    } else {
      quien = `grupo de ${ids.length}`;
    }
    partes.push(`${hhmm(c.inicio_min)} ${quien}`);
  }

  const linea = partes.join(" · ");
  return linea.length > MAX_LISTA ? `${linea.slice(0, MAX_LISTA - 1)}…` : linea;
}

export async function avisarProfeDeCambio(
  orgId: string,
  fecha: string,
  claseProfeId?: string | null,
): Promise<void> {
  try {
    const db = dbDeOrg(orgId);
    if (!db) return;

    // Si la clase que cambió es de un admin (la directora), no avisamos al profe.
    if (claseProfeId) {
      const { data: dueno } = await db
        .from("profiles")
        .select("rol")
        .eq("id", claseProfeId)
        .maybeSingle();
      if (dueno?.rol === "ADMIN") return;
    }

    // El profe a avisar: único PROFE activo con teléfono cargado.
    const { data: profes } = await db
      .from("profiles")
      .select("id, nombre, telefono, activo")
      .eq("rol", "PROFE")
      .eq("activo", true);
    const profe = (profes ?? []).find((p) => p.telefono);
    if (!profe) return;

    const diaLabel = `${nombreDiaLargo(fecha)} ${ddmm(fecha)}`;
    const lista = await listaDelDia(db, fecha);

    // Plantilla `aviso_profe_agenda` — variables: nombre del profe, día, clases.
    await enviarPlantilla(orgId, profe.telefono, PLANTILLAS.AVISO_PROFE, [
      primerNombre(profe.nombre),
      diaLabel,
      lista,
    ]);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "Error desconocido";
    console.error("[aviso-profe] no se pudo avisar al profe:", detalle);
  }
}
