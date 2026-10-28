/**
 * Prueba de punta a punta de TODOS los flujos del bot, con guion fijo.
 *
 * A diferencia de la batería (donde otra IA improvisa como alumna), acá los
 * mensajes del alumno están escritos, para recorrer siempre los mismos casos:
 * primer contacto, alta, agenda, reagenda, cancelación, grupales, coordinación
 * grupal, dudas de anatomía del libro y de internet, y seña.
 *
 * NO sale nada por WhatsApp: se sacan del entorno las claves antes de cargar
 * el bot. Los datos de prueba usan contactos "test-flujo-" y se borran con
 * --limpiar.
 *
 *   npx tsx --conditions=react-server scripts/prueba-flujos.ts
 *   npx tsx --conditions=react-server scripts/prueba-flujos.ts --limpiar
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const SALIDA = process.env.FLUJOS_SALIDA ?? path.join(RAIZ, "bateria-resultados");
const PREFIJO = "test-flujo-";

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

// — Fechas de la semana que viene, para no pisar clases reales —
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function proximo(diaSemana: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 7 + ((diaSemana - d.getDay() + 7) % 7));
  return `${DIAS[diaSemana]} ${d.getDate()}/${d.getMonth() + 1}`;
}
const LUNES = proximo(1);
const MARTES = proximo(2);
const JUEVES = proximo(4);
const SABADO = proximo(6);

type Paso = { de: string; texto: string };
type Flujo = { titulo: string; que: string; pasos: Paso[] };

const A = `${PREFIJO}ana`; // alumna principal
const B = `${PREFIJO}brenda`; // compañera de la grupal
const C = `${PREFIJO}carla`; // otra compañera

const FLUJOS: Flujo[] = [
  {
    titulo: "1. Primer contacto y precios",
    que: "Alguien escribe por primera vez y pregunta cómo son las clases.",
    pasos: [
      { de: A, texto: "hola! me pasaron tu numero, das clases de anatomia?" },
      { de: A, texto: "cuanto sale? y como son las clases?" },
      { de: A, texto: "ah mira, y si somos varias sale mas barato?" },
    ],
  },
  {
    titulo: "2. Alta y primera clase individual",
    que: "Se anota, da sus datos y agenda una clase individual.",
    pasos: [
      {
        de: A,
        texto:
          "dale, quiero arrancar. soy Ana Pruebaflujo, estudio Medicina, mi mail es flujo.ana@gmail.com",
      },
      { de: A, texto: `me sirve el ${MARTES} a las 18, una hora` },
      { de: A, texto: "perfecto, ahora transfiero la seña" },
    ],
  },
  {
    titulo: "3. Reagendar la clase individual",
    que: "Pide mover su clase a otro día.",
    pasos: [
      { de: A, texto: "hola! me surgio un parcial, puedo pasar la clase a otro dia?" },
      { de: A, texto: `me vendria mejor el ${JUEVES} a las 20` },
    ],
  },
  {
    titulo: "4. Cancelar una clase",
    que: "Quiere cancelar directamente, sin reprogramar.",
    pasos: [
      { de: A, texto: "al final necesito cancelar la clase, no voy a poder" },
      { de: A, texto: "y la seña que ya pagué qué pasa?" },
    ],
  },
  {
    titulo: "5. Agendar una clase grupal con compañeras",
    que: "Quiere una grupal con dos compañeras que todavía no están anotadas.",
    pasos: [
      { de: A, texto: "quiero armar una grupal con dos compañeras mias" },
      {
        de: A,
        texto:
          "son Brenda Pruebaflujo (flujo.brenda@gmail.com) y Carla Pruebaflujo (flujo.carla@gmail.com), las dos de Medicina",
      },
      { de: A, texto: `nos queda bien el ${SABADO} a las 10, dos horas` },
    ],
  },
  {
    titulo: "6. Reagendar la clase grupal",
    que: "Una integrante pide moverla: el bot tiene que consultarle a las otras.",
    pasos: [
      { de: A, texto: `che, la grupal del sabado la podriamos pasar al ${LUNES} a las 19?` },
      { de: B, texto: "hola! me avisaron del cambio de horario, por mi si, me sirve el lunes" },
      { de: B, texto: "mi mail es flujo.brenda@gmail.com" },
      { de: C, texto: "a mi el lunes no me sirve, prefiero quedarme como estaba. mi mail es flujo.carla@gmail.com" },
      { de: A, texto: "y al final en que quedo la grupal?" },
    ],
  },
  {
    titulo: "7. Duda de anatomía que está en los libros",
    que: "Pregunta un tema que la biblioteca sí tiene.",
    pasos: [
      { de: A, texto: "aprovecho y te hago una consulta, me explicas el trayecto del nervio radial?" },
      { de: A, texto: "y que musculos inerva en el antebrazo?" },
    ],
  },
  {
    titulo: "8. Duda que NO está en los libros",
    que: "Pregunta algo de fisiología, que no está en la bibliografía cargada.",
    pasos: [{ de: A, texto: "otra cosa, me explicas que es el gasto cardiaco y como se calcula?" }],
  },
  {
    titulo: "9. Avisa que pagó la seña",
    que: "Dice que transfirió, sin mandar comprobante.",
    pasos: [{ de: A, texto: "ya te transferí la seña de la grupal" }],
  },
];

// — El bot imprime en consola lo que hace: lo capturamos por contacto —
const logOriginal = console.log;
const oyentes = new Set<(...a: unknown[]) => void>();
console.log = (...args: unknown[]) => {
  for (const o of oyentes) o(...args);
};

async function main() {
  if (process.argv.includes("--limpiar")) return limpiar();
  fs.mkdirSync(SALIDA, { recursive: true });
  const { procesarMensajeEntrante } = await import("../lib/bot/procesar");
  const orgId = await (await import("../lib/organizacion")).orgPorDefecto();

  const partes: string[] = [
    `# Prueba completa del bot — ${new Date().toLocaleString("es-AR")}`,
    "",
    "Conversaciones contra la lógica real del bot (mismas instrucciones, mismas",
    "herramientas y misma base de datos). No se envió nada por WhatsApp.",
    "",
    `Alumna: **Ana Pruebaflujo** · Compañeras: **Brenda** y **Carla**.`,
    "",
  ];

  for (const flujo of FLUJOS) {
    logOriginal(`\n=== ${flujo.titulo}`);
    partes.push(`\n## ${flujo.titulo}`, "", `_${flujo.que}_`, "");
    for (const paso of flujo.pasos) {
      const quien = paso.de === A ? "Ana" : paso.de === B ? "Brenda" : "Carla";
      const herramientas: string[] = [];
      const escuchar = (...args: unknown[]) => {
        const linea = args.map(String).join(" ");
        if (linea.includes(` ${paso.de} `)) {
          herramientas.push(linea.replace(`${paso.de} `, ""));
        }
      };
      oyentes.add(escuchar);
      let respuesta: string;
      try {
        const r = await procesarMensajeEntrante(orgId, paso.de, paso.texto, { sinWhatsApp: true });
        respuesta = r.enModoHumano
          ? "(el bot dejó de responder: la charla pasó a la directora)"
          : r.respuesta;
      } catch (e) {
        respuesta = `(ERROR: ${e instanceof Error ? e.message : String(e)})`;
      } finally {
        oyentes.delete(escuchar);
      }
      partes.push(`**${quien}:** ${paso.texto}`, "");
      partes.push(`**Bot:** ${respuesta.split("\n").join("  \n")}`, "");
      const acciones = herramientas.filter((h) => h.startsWith("[herramienta]"));
      if (acciones.length) {
        partes.push(...acciones.map((h) => `> 🔧 ${h.replace("[herramienta] ", "").slice(0, 300)}`), "");
      }
      logOriginal(`  ${quien}: ${paso.texto.slice(0, 50)} → ${respuesta.length} caracteres`);
    }
  }

  const destino = path.join(SALIDA, "prueba-completa.md");
  fs.writeFileSync(destino, partes.join("\n"), "utf8");
  logOriginal(`\nInforme: ${destino}`);
}

async function limpiar(): Promise<void> {
  const { dbDeOrg } = await import("../lib/supabase/org");
  const db = dbDeOrg(await (await import("../lib/organizacion")).orgPorDefecto());
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { data: alumnos } = await db
    .from("alumnos")
    .select("id")
    .or(`telefono.like.${PREFIJO}%,email.like.flujo.%@gmail.com`);
  const ids = (alumnos ?? []).map((a) => a.id);
  let clases = 0;
  if (ids.length) {
    const { data: vinculos } = await db.from("clase_alumnos").select("clase_id").in("alumno_id", ids);
    const claseIds = [...new Set((vinculos ?? []).map((v) => v.clase_id))];
    if (claseIds.length) {
      const { data: todos } = await db
        .from("clase_alumnos")
        .select("clase_id, alumno_id")
        .in("clase_id", claseIds);
      const conReales = new Set(
        (todos ?? []).filter((t) => !ids.includes(t.alumno_id)).map((t) => t.clase_id),
      );
      const borrables = claseIds.filter((c) => !conReales.has(c));
      if (borrables.length) {
        await db.from("clases").delete().in("id", borrables);
        clases = borrables.length;
      }
    }
    await db.from("alumnos").delete().in("id", ids);
  }
  const { data: convs } = await db
    .from("bot_conversaciones")
    .delete()
    .like("contacto", `${PREFIJO}%`)
    .select("id");
  logOriginal(
    `limpieza: ${ids.length} alumnos, ${clases} clases y ${(convs ?? []).length} conversaciones de prueba borradas`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    logOriginal(e);
    process.exit(1);
  },
);
