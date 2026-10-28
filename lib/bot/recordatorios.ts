import "server-only";
import { dbDeOrg } from "@/lib/supabase/org";
import { enviarPlantilla, PLANTILLAS } from "@/lib/bot/whatsapp";
import { anotarEnvioAutomatico } from "@/lib/bot/conversaciones";
import { ahoraEn, sumarDias } from "@/lib/fechas";
import { zonaDe } from "@/lib/organizacion";

/**
 * Recordatorios automáticos de clase.
 *
 * Se manda DOS veces por clase (ver vercel.json):
 *   - "PREVIO": la noche anterior (20 hs arg), sobre las clases de mañana.
 *   - "HOY":    a la mañana (9 hs arg), sobre las clases de ese mismo día.
 *
 * Cada momento tiene su propia marca en la clase, así uno no le tapa el turno
 * al otro. La plantilla de WhatsApp es la MISMA para los dos
 * (`recordatorio_clase`); lo único que cambia es la palabra que viaja en la
 * variable: "mañana" u "hoy".
 *
 * Ojo con el cron: en el plan Hobby de Vercel la precisión es de una hora (se
 * puede disparar hasta 59 minutos tarde). Por eso el aviso del mismo día saltea
 * las clases que ya empezaron: mejor no mandar nada que mandar tarde.
 */

export type MomentoRecordatorio = "PREVIO" | "HOY";

const CONFIG: Record<
  MomentoRecordatorio,
  {
    columna: "recordatorio_enviado" | "recordatorio_hoy_enviado";
    palabra: string;
    diasAdelante: number;
  }
> = {
  PREVIO: { columna: "recordatorio_enviado", palabra: "mañana", diasAdelante: 1 },
  HOY: { columna: "recordatorio_hoy_enviado", palabra: "hoy", diasAdelante: 0 },
};

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function primerNombre(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}

export type ResumenRecordatorios = {
  momento: MomentoRecordatorio;
  clasesRecordadas: number;
  mensajesEnviados: number;
};

export async function enviarRecordatoriosDeClase(
  orgId: string,
  momento: MomentoRecordatorio,
): Promise<ResumenRecordatorios> {
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");

  const { columna, palabra, diasAdelante } = CONFIG[momento];
  const { fecha: hoy, minutos: ahoraMin } = ahoraEn(await zonaDe(orgId));
  const fecha = diasAdelante === 0 ? hoy : sumarDias(hoy, diasAdelante);

  const marcarHecha = async (claseId: string) => {
    const { error } = await db
      .from("clases")
      .update({ [columna]: true })
      .eq("id", claseId);
    // No cortamos el lote por una clase, pero que quede en el log: si esto
    // falla, mañana se vuelve a mandar el mismo recordatorio.
    if (error) {
      console.error(
        `[recordatorios] no pude marcar la clase ${claseId} como recordada:`,
        error.message,
      );
    }
  };

  const { data: clases, error: errClases } = await db
    .from("clases")
    .select("id, fecha, inicio_min, tipo")
    .eq("fecha", fecha)
    .eq(columna, false);
  // Si la consulta falla (típico: falta la columna porque no se corrió la
  // migración), hay que gritar. Si nos quedáramos callados, el cron devolvería
  // "0 recordatorios" con cara de éxito y nadie recibiría nada.
  if (errClases) {
    throw new Error(
      `No se pudieron leer las clases para el recordatorio "${momento}": ${errClases.message}`,
    );
  }
  if (!clases || clases.length === 0) {
    return { momento, clasesRecordadas: 0, mensajesEnviados: 0 };
  }

  let clasesRecordadas = 0;
  let mensajesEnviados = 0;

  for (const clase of clases) {
    // Clase que ya arrancó: no tiene sentido recordarla. La marco para no
    // volver a mirarla y sigo.
    if (momento === "HOY" && clase.inicio_min <= ahoraMin) {
      await marcarHecha(clase.id);
      continue;
    }

    const { data: links } = await db
      .from("clase_alumnos")
      .select("alumno_id")
      .eq("clase_id", clase.id);
    const alumnoIds = (links ?? []).map((l) => l.alumno_id);
    if (alumnoIds.length === 0) {
      // Clase sin alumnos: la marco igual para no volver a mirarla.
      await marcarHecha(clase.id);
      continue;
    }

    const { data: alumnos } = await db
      .from("alumnos")
      .select("id, nombre, telefono")
      .in("id", alumnoIds);

    const hora = hhmm(clase.inicio_min);

    for (const a of alumnos ?? []) {
      if (!a.telefono) continue;
      // Plantilla `recordatorio_clase` — variables: nombre, cuándo, hora.
      const envio = await enviarPlantilla(orgId, a.telefono, PLANTILLAS.RECORDATORIO_CLASE, [
        primerNombre(a.nombre),
        palabra,
        hora,
      ]);
      if (envio.enviado) {
        mensajesEnviados++;
        await anotarEnvioAutomatico(
          orgId,
          a.telefono,
          `recordatorio de su clase de ${palabra} a las ${hora}.`,
        );
      }
    }

    await marcarHecha(clase.id);
    clasesRecordadas++;
  }

  return { momento, clasesRecordadas, mensajesEnviados };
}
