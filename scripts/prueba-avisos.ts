/**
 * Prueba de los mensajes que el bot manda POR SU CUENTA: recordatorio de la
 * noche anterior, recordatorio del mismo día, consulta post-clase ("cómo te
 * fue?") y aviso de agenda al profe.
 *
 * Crea clases de prueba, dispara los envíos y muestra qué plantilla saldría
 * para cada alumno, con sus datos ya completados. NO sale nada por WhatsApp:
 * se sacan las claves del entorno antes de cargar el bot.
 *
 *   npx tsx --conditions=react-server scripts/prueba-avisos.ts
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const PREFIJO = "test-aviso-";

for (const linea of fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
for (const clave of [
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_SUBJECT",
]) {
  delete process.env[clave];
}
// Y el interruptor explícito: con los números en la base, borrar las
// variables no alcanza para frenar a una academia con token propio.
process.env.WHATSAPP_EN_SECO = "1";

const logOriginal = console.log;
const capturado: string[] = [];
console.log = (...args: unknown[]) => {
  capturado.push(args.map(String).join(" "));
};

async function main() {
  const { dbDeOrg } = await import("../lib/supabase/org");
  const orgId = await (await import("../lib/organizacion")).orgPorDefecto();
  const { ahoraEn, sumarDias } = await import("../lib/fechas");
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");

  const hoy = ahoraEn("America/Argentina/Cordoba").fecha;
  const manana = sumarDias(hoy, 1);
  const ayer = sumarDias(hoy, -1);

  // — Alumnos de prueba —
  const alumnos = [
    { id: `${PREFIJO}a1`, nombre: "Lucía Pruebaviso", telefono: `${PREFIJO}1` },
    { id: `${PREFIJO}a2`, nombre: "Martín Pruebaviso", telefono: `${PREFIJO}2` },
  ];
  for (const a of alumnos) {
    await db.from("alumnos").upsert({
      id: a.id,
      nombre: a.nombre,
      carrera: "Medicina",
      telefono: a.telefono,
      email: `${a.id}@pruebaviso.com`,
      notas: "Alumno de prueba de avisos.",
    });
  }

  // — Clases: una mañana (recordatorio previo), una hoy más tarde
  //   (recordatorio del día) y una de ayer (consulta post-clase) —
  const clases = [
    { id: `${PREFIJO}c1`, fecha: manana, inicio_min: 18 * 60, quien: alumnos[0] },
    { id: `${PREFIJO}c2`, fecha: hoy, inicio_min: 23 * 60, quien: alumnos[1] },
    { id: `${PREFIJO}c3`, fecha: ayer, inicio_min: 10 * 60, quien: alumnos[0] },
  ];
  for (const c of clases) {
    await db.from("clases").upsert({
      id: c.id,
      tipo: "INDIVIDUAL",
      fecha: c.fecha,
      inicio_min: c.inicio_min,
      duracion: 60,
      recordatorio_enviado: false,
      recordatorio_hoy_enviado: false,
      feedback_enviado: false,
    });
    await db.from("clase_alumnos").upsert({ clase_id: c.id, alumno_id: c.quien.id });
  }

  // Los envíos recorren TODAS las clases, también las reales, y las marcan
  // como avisadas. Guardamos cómo estaban para dejarlas igual al terminar.
  const { data: previas } = await db
    .from("clases")
    .select("id, recordatorio_enviado, recordatorio_hoy_enviado, feedback_enviado");
  const estadoPrevio = previas ?? [];

  const { enviarRecordatoriosDeClase } = await import("../lib/bot/recordatorios");
  const { enviarConsultasPostClase } = await import("../lib/bot/post-clase");

  const partes: string[] = [
    `# Mensajes que el bot manda solo — ${new Date().toLocaleString("es-AR")}`,
    "",
    "Clases de prueba: una mañana a las 18, una hoy a las 23 y una de ayer a las 10.",
    "",
  ];

  const bloque = async (titulo: string, detalle: string, fn: () => Promise<unknown>) => {
    capturado.length = 0;
    const r = await fn();
    partes.push(`## ${titulo}`, "", `_${detalle}_`, "");
    const envios = capturado.filter((l) => l.includes("[whatsapp plantilla]"));
    if (envios.length === 0) partes.push("(no se mandó nada)", "");
    for (const e of envios) {
      const m = /→ (\S+): (\S+) \[ (.*) \]/.exec(e);
      if (m) {
        partes.push(`- **Plantilla \`${m[2]}\`** → ${m[1]}`, `  - Datos: ${m[3]}`, "");
      } else {
        partes.push(`- ${e}`, "");
      }
    }
    partes.push(`Resultado: \`${JSON.stringify(r)}\``, "");
  };

  await bloque(
    "Recordatorio de la noche anterior",
    "Sale a las 20 hs para las clases del día siguiente.",
    () => enviarRecordatoriosDeClase(orgId, "PREVIO"),
  );
  await bloque(
    "Recordatorio del mismo día",
    "Sale a las 9 hs para las clases de hoy que todavía no empezaron.",
    () => enviarRecordatoriosDeClase(orgId, "HOY"),
  );
  await bloque(
    "Consulta post-clase",
    "Al día siguiente de la clase, le pregunta al alumno cómo le fue.",
    () => enviarConsultasPostClase(orgId),
  );

  // — Limpieza: primero dejamos las clases reales como estaban —
  for (const c of estadoPrevio) {
    if (String(c.id).startsWith(PREFIJO)) continue;
    await db
      .from("clases")
      .update({
        recordatorio_enviado: c.recordatorio_enviado,
        recordatorio_hoy_enviado: c.recordatorio_hoy_enviado,
        feedback_enviado: c.feedback_enviado,
      })
      .eq("id", c.id);
  }
  logOriginal(`clases reales restauradas: ${estadoPrevio.length}`);

  await db.from("clases").delete().in("id", clases.map((c) => c.id));
  await db.from("alumnos").delete().in("id", alumnos.map((a) => a.id));
  await db.from("bot_conversaciones").delete().like("contacto", `${PREFIJO}%`);

  const destino = path.join(
    process.env.AVISOS_SALIDA ?? path.join(RAIZ, "bateria-resultados"),
    "avisos.md",
  );
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, partes.join("\n"), "utf8");
  logOriginal(partes.join("\n"));
  logOriginal(`\nInforme: ${destino}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    logOriginal(e);
    process.exit(1);
  },
);
