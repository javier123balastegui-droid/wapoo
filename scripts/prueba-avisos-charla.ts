/**
 * Prueba conversacional de los mensajes que el bot manda PRIMERO.
 *
 * Cada flujo arranca con la plantilla que sale sola (recordatorio del día
 * anterior, recordatorio del mismo día, consulta post-clase, consulta de
 * reagenda grupal) y sigue con lo que contesta el alumno, para ver cómo el
 * bot retoma la charla.
 *
 * El envío de la plantilla se simula: se deja anotada en la conversación
 * igual que en producción (ver anotarEnvioAutomatico), con el mismo texto que
 * la plantilla aprobada en Meta. Así el bot tiene el contexto real. NO se
 * manda nada por WhatsApp ni se tocan las clases reales.
 *
 *   npx tsx --conditions=react-server scripts/prueba-avisos-charla.ts
 *   npx tsx --conditions=react-server scripts/prueba-avisos-charla.ts --limpiar
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const SALIDA = process.env.AVISOS_SALIDA ?? path.join(RAIZ, "bateria-resultados");
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
process.env.BOT_LOG_HERRAMIENTAS = "1";

const logOriginal = console.log;
const oyentes = new Set<(...a: unknown[]) => void>();
console.log = (...args: unknown[]) => {
  for (const o of oyentes) o(...args);
};

type Flujo = {
  titulo: string;
  que: string;
  contacto: string;
  /** Texto de la plantilla, tal cual la aprobada en Meta. */
  plantilla: string;
  /** Resumen que queda anotado en la charla (igual que en producción). */
  anotacion: string;
  respuestas: string[];
};

async function main() {
  const { ahoraEn, sumarDias, fechaLargaES } = await import("../lib/fechas");
  const { dbDeOrg } = await import("../lib/supabase/org");
  const { anotarEnvioAutomatico } = await import("../lib/bot/conversaciones");
  const { procesarMensajeEntrante } = await import("../lib/bot/procesar");
  const orgId = await (await import("../lib/organizacion")).orgPorDefecto();
  const db = dbDeOrg(orgId);
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");

  if (process.argv.includes("--limpiar")) return limpiar(db);

  const hoy = ahoraEn("America/Argentina/Cordoba").fecha;
  const manana = sumarDias(hoy, 1);

  // — Alumnas de prueba, cada una con su clase —
  const gente = [
    { contacto: `${PREFIJO}sofia`, nombre: "Sofía Pruebaviso", clase: `${PREFIJO}cl1`, fecha: manana, hora: 18 },
    { contacto: `${PREFIJO}julia`, nombre: "Julia Pruebaviso", clase: `${PREFIJO}cl2`, fecha: hoy, hora: 21 },
    { contacto: `${PREFIJO}rocio`, nombre: "Rocío Pruebaviso", clase: `${PREFIJO}cl3`, fecha: manana, hora: 20 },
    { contacto: `${PREFIJO}vale`, nombre: "Valentina Pruebaviso", clase: `${PREFIJO}cl4`, fecha: manana, hora: 16 },
  ];
  for (const g of gente) {
    await db.from("alumnos").upsert({
      id: `a-${g.contacto}`,
      nombre: g.nombre,
      carrera: "Medicina",
      telefono: g.contacto,
      email: `${g.contacto}@pruebaviso.com`,
      notas: "Alumna de prueba de avisos.",
    });
    await db.from("clases").upsert({
      id: g.clase,
      tipo: "INDIVIDUAL",
      fecha: g.fecha,
      inicio_min: g.hora * 60,
      duracion: 60,
    });
    await db.from("clase_alumnos").upsert({ clase_id: g.clase, alumno_id: `a-${g.contacto}` });
    // La seña ya está paga: así se ve que no se la vuelven a pedir.
    await db.from("pagos").upsert({
      id: `p-${g.clase}`,
      clase_id: g.clase,
      alumno_id: `a-${g.contacto}`,
      estado: "SENADO",
      monto: 4500,
      fecha: hoy,
    });
  }

  const FLUJOS: Flujo[] = [
    {
      titulo: "1. Recordatorio de la noche anterior, y la alumna confirma",
      que: "Sale a las 20 hs el día previo.",
      contacto: gente[0].contacto,
      plantilla: `Hola Sofía! 🧠 RECORDATORIO: mañana tenés clase de anatomía a las 18:00 hs. Éxitos!!! 🦴✏️`,
      anotacion: "recordatorio de su clase de mañana a las 18:00.",
      respuestas: ["dale, gracias! ahi voy a estar", "che, el link del meet me lo pasan por aca?"],
    },
    {
      titulo: "2. Recordatorio del día anterior, pero no puede ir",
      que: "La alumna quiere mover la clase al recibir el recordatorio (tiene la seña paga).",
      contacto: gente[2].contacto,
      plantilla: `Hola Rocío! 🧠 RECORDATORIO: mañana tenés clase de anatomía a las 20:00 hs. Éxitos!!! 🦴✏️`,
      anotacion: "recordatorio de su clase de mañana a las 20:00.",
      respuestas: [
        "uy justo mañana no voy a poder, me surgio algo",
        "puede ser el sabado a la misma hora?",
      ],
    },
    {
      titulo: "3. Recordatorio del mismo día",
      que: "Sale a las 9 hs para las clases de hoy.",
      contacto: gente[1].contacto,
      plantilla: `Hola Julia! 🧠 RECORDATORIO: hoy tenés clase de anatomía a las 21:00 hs. Éxitos!!! 🦴✏️`,
      anotacion: "recordatorio de su clase de hoy a las 21:00.",
      respuestas: ["buenísimo! una consulta, puedo llevar dudas puntuales de miembro inferior?"],
    },
    {
      titulo: "4. Consulta post-clase: le fue bien",
      que: "Al día siguiente de la clase, el bot pregunta cómo le fue.",
      contacto: gente[3].contacto,
      plantilla: `Hola Valentina! 🧠 ¿Cómo te fue en la clase con Agustín? ¿Cómo te sentiste?`,
      anotacion: "le preguntamos cómo le fue en la clase que tuvo con Agustín.",
      respuestas: [
        "muy bien! me re sirvio, aunque me quedaron dudas con los pares craneales",
        "si, me gustaria seguir. cuando hay lugar la semana que viene?",
      ],
    },
    {
      titulo: "5. Consulta post-clase: no quedó conforme",
      que: "La alumna contesta con una queja.",
      contacto: gente[0].contacto,
      plantilla: `Hola Sofía! 🧠 ¿Cómo te fue en la clase con Agustín? ¿Cómo te sentiste?`,
      anotacion: "le preguntamos cómo le fue en la clase que tuvo con Agustín.",
      respuestas: [
        "la verdad no muy bien, senti que fuimos muy rapido y no entendi casi nada",
      ],
    },
  ];

  const partes: string[] = [
    `# Mensajes que el bot manda primero, y cómo sigue la charla — ${new Date().toLocaleString("es-AR")}`,
    "",
    `Hoy es ${fechaLargaES(hoy)}. Cada flujo arranca con la plantilla que sale sola;`,
    "después contesta la alumna. Las alumnas tienen la seña ya paga.",
    "",
  ];

  for (const f of FLUJOS) {
    logOriginal(`\n=== ${f.titulo}`);
    partes.push(`\n## ${f.titulo}`, "", `_${f.que}_`, "");
    partes.push(`**Bot (mensaje automático):** ${f.plantilla}`, "");
    await anotarEnvioAutomatico(orgId, f.contacto, f.anotacion);

    for (const texto of f.respuestas) {
      const herramientas: string[] = [];
      const escuchar = (...args: unknown[]) => {
        const linea = args.map(String).join(" ");
        if (linea.includes(` ${f.contacto} `)) herramientas.push(linea.replace(`${f.contacto} `, ""));
      };
      oyentes.add(escuchar);
      let respuesta: string;
      try {
        const r = await procesarMensajeEntrante(orgId, f.contacto, texto, { sinWhatsApp: true });
        respuesta = r.enModoHumano
          ? "(el bot dejó de responder: la charla pasó a la directora)"
          : r.respuesta;
      } catch (e) {
        respuesta = `(ERROR: ${e instanceof Error ? e.message : String(e)})`;
      } finally {
        oyentes.delete(escuchar);
      }
      partes.push(`**Alumna:** ${texto}`, "", `**Bot:** ${respuesta.split("\n").join("  \n")}`, "");
      const acciones = herramientas.filter((h) => h.startsWith("[herramienta]"));
      if (acciones.length) {
        partes.push(...acciones.map((h) => `> 🔧 ${h.replace("[herramienta] ", "").slice(0, 260)}`), "");
      }
      logOriginal(`  ${texto.slice(0, 45)} → ${respuesta.length} caracteres`);
    }
  }

  fs.mkdirSync(SALIDA, { recursive: true });
  const destino = path.join(SALIDA, "avisos-charla.md");
  fs.writeFileSync(destino, partes.join("\n"), "utf8");
  logOriginal(`\nInforme: ${destino}`);
}

async function limpiar(db: import("../lib/supabase/org").DbDeOrg) {
  const { data: alumnos } = await db.from("alumnos").select("id").like("telefono", `${PREFIJO}%`);
  const ids = (alumnos ?? []).map((a) => a.id);
  const { data: clases } = await db.from("clases").select("id").like("id", `${PREFIJO}%`);
  const claseIds = (clases ?? []).map((c) => c.id);
  if (claseIds.length) await db.from("clases").delete().in("id", claseIds);
  if (ids.length) await db.from("alumnos").delete().in("id", ids);
  await db.from("bot_conversaciones").delete().like("contacto", `${PREFIJO}%`);
  logOriginal(`limpieza: ${ids.length} alumnas y ${claseIds.length} clases de prueba borradas`);
}

main().then(
  () => process.exit(0),
  (e) => {
    logOriginal(e);
    process.exit(1);
  },
);
