import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";
import { enviarPlantilla, PLANTILLAS } from "@/lib/bot/whatsapp";
import { anotarEnvioAutomatico } from "@/lib/bot/conversaciones";
import { ahoraEn, sumarDias } from "@/lib/fechas";
import { zonaDe } from "@/lib/organizacion";

/**
 * Mensaje de "¿cómo te fue?" después de la clase.
 *
 * Lo disparan los DOS crons (9 hs y 20 hs), así una clase de la mañana o la
 * tarde se pregunta esa misma noche, y una de la noche a la mañana siguiente.
 * No se puede mandar justo al terminar la clase porque el plan Hobby de Vercel
 * solo permite crons una vez por día; para eso habría que pasar a Pro.
 *
 * Solo se pregunta por clases que:
 *   - ya terminaron (pasó la hora de inicio más la duración),
 *   - efectivamente ocurrieron: se saltean las CANCELADA, REAGENDADA y AUSENTE,
 *   - son de los últimos DIAS_ATRAS días,
 *   - y todavía no se preguntaron (feedback_enviado).
 *
 * El límite de días es una red de seguridad: si algún día se resetea la marca
 * por error, no se le escribe a todo el mundo por clases de hace meses.
 *
 * Efecto lateral bueno: como es una plantilla, cuando la alumna contesta se
 * abre la ventana de 24 h de WhatsApp y la directora puede escribirle libre.
 */

const DIAS_ATRAS = 2;

/** Una clase cancelada o reagendada no ocurrió, y a la que faltó no tiene
 *  sentido preguntarle qué tal le fue. */
const ESTADOS_QUE_CUENTAN = ["PENDIENTE", "REALIZADA"];

function primerNombre(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}

export type ResumenPostClase = {
  clasesConsultadas: number;
  mensajesEnviados: number;
};

export async function enviarConsultasPostClase(orgId: string): Promise<ResumenPostClase> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const { fecha: hoy, minutos: ahoraMin } = ahoraEn(await zonaDe(orgId));
  const desde = sumarDias(hoy, -DIAS_ATRAS);

  const { data: clases, error } = await db
    .from("clases")
    .select("id, fecha, inicio_min, duracion, estado_realizacion, profe_id")
    .gte("fecha", desde)
    .lte("fecha", hoy)
    .eq("feedback_enviado", false)
    .in("estado_realizacion", ESTADOS_QUE_CUENTAN);
  if (error) {
    throw new Error(
      `No se pudieron leer las clases para la consulta post clase: ${error.message}`,
    );
  }
  if (!clases || clases.length === 0) {
    return { clasesConsultadas: 0, mensajesEnviados: 0 };
  }

  let clasesConsultadas = 0;
  let mensajesEnviados = 0;

  for (const clase of clases) {
    // ¿Terminó? Las de días anteriores, sí. Las de hoy, solo si ya pasó la
    // hora de fin. Una clase que todavía no terminó se deja para la próxima
    // corrida del cron.
    const esDeHoy = clase.fecha === hoy;
    const yaTermino = esDeHoy
      ? clase.inicio_min + clase.duracion <= ahoraMin
      : true;
    if (!yaTermino) continue;

    const { data: links } = await db
      .from("clase_alumnos")
      .select("alumno_id")
      .eq("clase_id", clase.id);
    const alumnoIds = (links ?? []).map((l) => l.alumno_id);

    if (alumnoIds.length > 0) {
      // Quién dio la clase. Si no hay profe asignado usamos "el profe": una
      // variable de plantilla nunca puede llegar vacía o Meta rechaza el envío.
      let nombreProfe = "el profe";
      if (clase.profe_id) {
        const { data: profe } = await db
          .from("profiles")
          .select("nombre")
          .eq("id", clase.profe_id)
          .maybeSingle();
        if (profe?.nombre) nombreProfe = primerNombre(profe.nombre);
      }
      const { data: alumnos } = await db
        .from("alumnos")
        .select("id, nombre, telefono")
        .in("id", alumnoIds);

      for (const a of alumnos ?? []) {
        if (!a.telefono) continue;
        // Plantilla `consulta_post_clase` — variables: alumno y profe.
        const envio = await enviarPlantilla(orgId, a.telefono, PLANTILLAS.POST_CLASE, [
          primerNombre(a.nombre),
          nombreProfe,
        ]);
        if (envio.enviado) {
          mensajesEnviados++;
          await anotarEnvioAutomatico(
            orgId,
            a.telefono,
            `le preguntamos cómo le fue en la clase que tuvo con ${nombreProfe}.`,
          );
        }
      }
      clasesConsultadas++;
    }

    const { error: errMarca } = await db
      .from("clases")
      .update({ feedback_enviado: true })
      .eq("id", clase.id);
    if (errMarca) {
      console.error(
        `[post-clase] no pude marcar la clase ${clase.id} como preguntada:`,
        errMarca.message,
      );
    }
  }

  return { clasesConsultadas, mensajesEnviados };
}
