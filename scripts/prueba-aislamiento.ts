/**
 * Prueba de aislamiento entre academias (multi-cliente, paso 6).
 *
 * Crea una segunda academia de prueba con sus propios datos y comprueba, con
 * el código real (bot, portal, disponibilidad, configuración, biblioteca,
 * dominios), que ninguna de las dos ve ni puede tocar datos de la otra. Las
 * dos tienen a propósito un alumno con el MISMO teléfono, una carrera con el
 * mismo id y una charla con el mismo contacto: lo que antes era único en toda
 * la base.
 *
 * NO sale nada por WhatsApp ni por notificaciones (modo en seco). Lo que SÍ
 * toca es la base: la academia de prueba y los datos de prueba de las dos
 * academias usan el contacto "test-aislamiento-1" y se borran con --limpiar.
 *
 * Uso, desde la carpeta del proyecto:
 *   npx tsx --conditions=react-server scripts/prueba-aislamiento.ts --preparar
 *   npx tsx --conditions=react-server scripts/prueba-aislamiento.ts --verificar
 *   npx tsx --conditions=react-server scripts/prueba-aislamiento.ts --verificar --con-bot
 *   npx tsx --conditions=react-server scripts/prueba-aislamiento.ts --limpiar
 *
 * --con-bot además le manda un mensaje al bot de cada academia (gasta un poco
 * de saldo de Anthropic) y revisa que cada uno conteste como su academia.
 *
 * Entre --preparar y --limpiar se pueden hacer pruebas a mano: el dominio
 * "prueba-aislamiento.test" es de la academia de prueba (en local se prueba
 * con: curl -H "Host: prueba-aislamiento.test" http://localhost:3000/).
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
for (const linea of fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
// Nada sale al mundo real: ni WhatsApp ni notificaciones push.
process.env.WHATSAPP_EN_SECO = "1";
for (const clave of ["VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_SUBJECT"]) {
  delete process.env[clave];
}

const SLUG_B = "prueba-aislamiento";
const DOMINIO_B = "prueba-aislamiento.test";
const CONTACTO = "test-aislamiento-1";

/** Un martes al menos una semana adelante: no pisa clases reales cercanas. */
function martesQueViene(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function cargar() {
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { dbDeOrg } = await import("../lib/supabase/org");
  const { orgPorDefecto } = await import("../lib/organizacion");
  const admin = createAdminClient();
  if (!admin) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const orgA = await orgPorDefecto();
  const { data: b } = await admin.from("organizaciones").select("id").eq("slug", SLUG_B).maybeSingle();
  return { admin, dbDeOrg, orgA, orgB: b?.id ? String(b.id) : null };
}

async function preparar() {
  const { admin, dbDeOrg, orgA, orgB: existente } = await cargar();
  if (existente) throw new Error("La academia de prueba ya existe: corré --limpiar primero.");
  const { crearPerfilAlumno, agendarClaseBot } = await import("../lib/bot/acciones");
  const { getOrCreateConversacion, guardarMensaje } = await import("../lib/bot/conversaciones");
  const fecha = martesQueViene();

  const { data: org, error } = await admin
    .from("organizaciones")
    .insert({
      slug: SLUG_B,
      nombre: "Academia de Prueba",
      directora: "Directora Prueba",
      materia: "Matemática",
      descripcion: "Clases particulares de matemática para secundario.",
      alias_pago: "prueba.aislamiento.mp",
      titular_pago: "Directora Prueba",
      url_portal: `https://${DOMINIO_B}/`,
      horarios_atencion: {
        "1": { apertura: 600, cierre: 1200 },
        "2": { apertura: 600, cierre: 1200 },
        "3": { apertura: 600, cierre: 1200 },
        "4": { apertura: 600, cierre: 1200 },
        "5": { apertura: 600, cierre: 1200 },
      },
      reagenda_anticipacion_min: 1440,
      reagenda_tolerancia_min: 0,
      // En otro país a propósito: otra moneda y otro huso (con horario de verano).
      moneda: "EUR",
      locale: "es-ES",
      zona_horaria: "Europe/Madrid",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const orgB = String(org.id);
  const dbB = dbDeOrg(orgB)!;

  const paso = async (que: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error: e } = await p;
    if (e) throw new Error(`${que}: ${e.message}`);
  };
  await paso("dominio", admin.from("organizacion_dominios").insert({ dominio: DOMINIO_B, organizacion_id: orgB }));
  await paso("config", dbB.from("bot_config").insert({ modo: "PRUEBA", responder: true, enlace_clase: "https://meet.prueba/b" }));
  await paso("precios", dbB.from("precios").insert({ valor_individual: 1111, valor_grupal_2: 999, valor_grupal_3: 888, valor_sena: 111 }));
  // Mismo id de carrera que en Anatomía: antes la clave era global.
  await paso("carrera", dbB.from("carreras").insert({ id: "medicina", nombre: "Medicina" }));
  await paso("día sin clase", dbB.from("dias_sin_clase").insert({ fecha, motivo: "feriado de prueba" }));

  // El mismo teléfono, alumno en las dos academias.
  const alumnoA = await crearPerfilAlumno(orgA, { nombre: "Alumna Aislamiento A", carrera: "Medicina", telefono: CONTACTO, email: "aislamiento.a@prueba.test" });
  const alumnoB = await crearPerfilAlumno(orgB, { nombre: "Alumna Aislamiento B", carrera: "Secundario", telefono: CONTACTO, email: "aislamiento.b@prueba.test" });
  // Clases el mismo día: en A a las 17, en B a las 15. El día sin clase de B
  // no aplica a la agenda (lo usa para ofrecer horarios), así que se agenda
  // directo en la base para B.
  const claseA = await agendarClaseBot(orgA, CONTACTO, "INDIVIDUAL", fecha, 17 * 60, 60);
  if (!claseA.ok) throw new Error(`clase A: ${JSON.stringify(claseA)}`);
  const idClaseB = `c-aislamiento-b-${Date.now()}`;
  await paso("clase B", dbB.from("clases").insert({ id: idClaseB, tipo: "INDIVIDUAL", fecha, inicio_min: 15 * 60, duracion: 60 }));
  await paso("alumno en clase B", dbB.from("clase_alumnos").insert({ clase_id: idClaseB, alumno_id: alumnoB.id }));
  await paso("pago B", dbB.from("pagos").insert({ id: `p-aislamiento-b-${Date.now()}`, clase_id: idClaseB, alumno_id: alumnoB.id, estado: "SENADO" }));

  // La misma charla (mismo contacto) en las dos academias.
  const convA = await getOrCreateConversacion(orgA, CONTACTO);
  const convB = await getOrCreateConversacion(orgB, CONTACTO);
  await guardarMensaje(orgA, convA.id, "user", "mensaje de prueba en A");
  await guardarMensaje(orgB, convB.id, "user", "mensaje de prueba en B");

  console.log(`Academia de prueba creada (${SLUG_B}), con datos para el ${fecha}.`);
  console.log(`Códigos de acceso: A ${alumnoA.codigoAcceso} · B ${alumnoB.codigoAcceso}`);
}

async function verificar(conBot: boolean) {
  const { admin, dbDeOrg, orgA, orgB } = await cargar();
  if (!orgB) throw new Error("No existe la academia de prueba: corré --preparar primero.");
  const fecha = martesQueViene();
  const acciones = await import("../lib/bot/acciones");
  const conv = await import("../lib/bot/conversaciones");
  const disp = await import("../lib/disponibilidad");
  const { getConfigBot } = await import("../lib/bot/config");
  const { getAlumnoPorCodigo, getClasesDelAlumno } = await import("../lib/portal-data");
  const { buscarEnBiblioteca, listarDocumentos } = await import("../lib/biblioteca");
  const { orgPorDominio, listarOrganizacionesActivas } = await import("../lib/organizacion");
  const { numeroDeOrg } = await import("../lib/bot/numeros");

  let fallas = 0;
  const ok = (que: string, cumple: boolean, detalle = "") => {
    if (!cumple) fallas++;
    console.log(`${cumple ? "ok " : "MAL"}  ${que}${detalle ? `  (${detalle})` : ""}`);
  };

  // — Identidad: el mismo teléfono es una persona distinta en cada academia —
  const datosA = await acciones.datosAlumnoDeContacto(orgA, CONTACTO);
  const datosB = await acciones.datosAlumnoDeContacto(orgB, CONTACTO);
  ok("el mismo teléfono es la alumna de A en A", datosA?.nombre === "Alumna Aislamiento A", datosA?.nombre);
  ok("y la alumna de B en B", datosB?.nombre === "Alumna Aislamiento B", datosB?.nombre);

  // — Charlas del bot —
  const convA = await conv.getOrCreateConversacion(orgA, CONTACTO);
  const convB = await conv.getOrCreateConversacion(orgB, CONTACTO);
  ok("el mismo contacto tiene una charla distinta en cada academia", convA.id !== convB.id);
  const listaA = await conv.listarConversacionesBot(orgA);
  const listaB = await conv.listarConversacionesBot(orgB);
  ok("el panel de A no lista la charla de B", !listaA.some((c) => c.id === convB.id));
  ok("el panel de B lista solo la suya", listaB.length === 1 && listaB[0].id === convB.id, `${listaB.length}`);
  ok("A no puede abrir la charla de B por su id", (await conv.getConversacionBotDetalle(orgA, convB.id)) === null);
  const msgsA = await conv.getMensajes(orgA, convA.id);
  ok("el historial de A no trae mensajes de B", !msgsA.some((m) => m.contenido.includes("en B")));
  ok("pedir los mensajes de la charla de B desde A no trae nada", (await conv.getMensajes(orgA, convB.id)).length === 0);

  // — Clases y agenda —
  const clasesA = await acciones.misClasesFuturas(orgA, CONTACTO);
  const clasesB = await acciones.misClasesFuturas(orgB, CONTACTO);
  ok("la alumna ve en A solo su clase de A (17 hs)", clasesA.length === 1 && clasesA[0].hora === "17:00", clasesA.map((c) => c.hora).join(","));
  ok("y en B solo la de B (15 hs)", clasesB.length === 1 && clasesB[0].hora === "15:00", clasesB.map((c) => c.hora).join(","));
  const delDiaA = await disp.clasesDelDia(orgA, fecha);
  const delDiaB = await disp.clasesDelDia(orgB, fecha);
  ok("la agenda del día de A no incluye la clase de B", !delDiaA.some((a) => delDiaB.some((b) => b.id === a.id)));
  ok("la agenda del día de B tiene solo su clase", delDiaB.length === 1, `${delDiaB.length}`);
  ok("el feriado de B no cierra el día en A", (await disp.motivoDiaSinClase(orgA, fecha)) === null);
  ok("y en B sí", (await disp.motivoDiaSinClase(orgB, fecha)) === "feriado de prueba");
  const horariosB = await acciones.horariosDisponibles(orgB, CONTACTO, fecha, 60);
  ok("B no ofrece horarios en su feriado", !horariosB.ok, horariosB.ok ? horariosB.horarios.join(",") : horariosB.motivo.slice(0, 60));

  // — Configuración y precios —
  const cfgA = await getConfigBot(orgA);
  const cfgB = await getConfigBot(orgB);
  ok("cada academia tiene su configuración del bot", cfgB.modo === "PRUEBA" && cfgB.enlaceClase === "https://meet.prueba/b" && cfgA.enlaceClase !== cfgB.enlaceClase);
  const precA = await acciones.preciosVigentes(orgA);
  const precB = await acciones.preciosVigentes(orgB);
  ok("cada academia tiene sus precios", precB?.valorSena === 111 && precA?.valorSena !== 111, `A ${precA?.valorSena} · B ${precB?.valorSena}`);

  // — Portal del alumno —
  const { data: filaB } = await dbDeOrg(orgB)!.from("alumnos").select("id, codigo_acceso").eq("telefono", CONTACTO).single();
  const alumnoB = await getAlumnoPorCodigo(String(filaB!.codigo_acceso));
  ok("el código de la alumna de B dice que es de B", alumnoB?.organizacionId === orgB);
  ok("con la academia de A no se ven las clases de la alumna de B", (await getClasesDelAlumno(orgA, filaB!.id)).length === 0);
  ok("con la de B sí", (await getClasesDelAlumno(orgB, filaB!.id)).length === 1);

  // — Escrituras cruzadas: desde A no se toca nada de B —
  const dbA = dbDeOrg(orgA)!;
  const mod = await dbA.from("alumnos").update({ nombre: "HACKEADO" }).eq("id", filaB!.id).select("id");
  const bor = await dbA.from("alumnos").delete().eq("id", filaB!.id).select("id");
  const { data: sigue } = await dbDeOrg(orgB)!.from("alumnos").select("nombre").eq("id", filaB!.id).single();
  ok("A no puede modificar ni borrar a la alumna de B", (mod.data ?? []).length === 0 && (bor.data ?? []).length === 0 && sigue?.nombre === "Alumna Aislamiento B");
  const mover = await dbA.from("clases").update({ inicio_min: 0 }).eq("fecha", fecha).eq("inicio_min", 15 * 60).select("id");
  ok("A no puede mover la clase de B", (mover.data ?? []).length === 0);

  // — Biblioteca —
  ok("B no tiene los libros de A", (await listarDocumentos(orgB)).length === 0 && (await listarDocumentos(orgA)).length > 0);
  ok("buscar en la biblioteca desde B no trae pasajes de A", (await buscarEnBiblioteca(orgB, "nervio radial")).length === 0);

  // — Dominios, crons y WhatsApp —
  ok("el dominio de prueba es de B", (await orgPorDominio(DOMINIO_B))?.id === orgB);
  ok("el de Anatomía es de A", (await orgPorDominio("academia-demo.vercel.app"))?.id === orgA);
  ok("un dominio inventado no es de nadie", (await orgPorDominio("no-existe.test")) === null);
  const activas = await listarOrganizacionesActivas();
  ok("los crons recorren las dos academias", activas.some((o) => o.id === orgA) && activas.some((o) => o.id === orgB));
  delete process.env.WHATSAPP_EN_SECO; // solo para leer el número, no se manda nada
  ok("B no tiene número de WhatsApp, así que no puede mandar desde el de A", (await numeroDeOrg(orgB)) === null);

  // — Moneda y zona horaria de cada una —
  const { getOrganizacion, monedaDe, zonaDe } = await import("../lib/organizacion");
  const { montoTexto } = await import("../lib/utils");
  const { ahoraEn, enZonaDelAlumno } = await import("../lib/fechas");
  ok("cada academia en su moneda", montoTexto(111, monedaDe(await getOrganizacion(orgB))).includes("€") && montoTexto(4500, monedaDe(await getOrganizacion(orgA))) === "$4.500");
  const [zA, zB] = [await zonaDe(orgA), await zonaDe(orgB)];
  ok("cada academia con su zona", zA === "America/Argentina/Cordoba" && zB === "Europe/Madrid");
  const diferencia = ((ahoraEn(zB).minutos - ahoraEn(zA).minutos) + 1440) % 1440;
  ok("ahora en B va 4 o 5 horas adelante de A (según el horario de verano de España)", diferencia === 240 || diferencia === 300, `${diferencia / 60} h`);
  const deB = enZonaDelAlumno(fecha, 15 * 60, zA, zB);
  ok("la clase de B a las 15 de Madrid, vista desde Argentina", deB.hora === "11:00" || deB.hora === "10:00", deB.hora);
  process.env.WHATSAPP_EN_SECO = "1";

  // — Lo que quedó en la base, contado sin filtro: cada fila en su academia —
  const tablas = ["alumnos", "clases", "pagos", "bot_conversaciones", "bot_mensajes", "carreras", "dias_sin_clase", "precios", "bot_config"];
  let mezcladas = 0;
  for (const t of tablas) {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).is("organizacion_id", null);
    mezcladas += count ?? 0;
  }
  ok("no hay filas sin academia", mezcladas === 0, `${mezcladas}`);

  // — El bot de cada academia contesta como su academia —
  if (conBot) {
    const { procesarMensajeEntrante } = await import("../lib/bot/procesar");
    const pregunta = "hola! cuánto sale una clase individual y cómo te pago la seña?";
    const rA = await procesarMensajeEntrante(orgA, CONTACTO, pregunta, { sinWhatsApp: true });
    const rB = await procesarMensajeEntrante(orgB, CONTACTO, pregunta, { sinWhatsApp: true });
    console.log(`\n  Bot de A: ${rA.respuesta.replace(/\n+/g, " ").slice(0, 300)}`);
    console.log(`  Bot de B: ${rB.respuesta.replace(/\n+/g, " ").slice(0, 300)}\n`);
    ok("el bot de B usa los datos de B (alias y precio)", rB.respuesta.includes("prueba.aislamiento.mp") || rB.respuesta.includes("1111") || rB.respuesta.includes("1.111"));
    ok("el bot de B habla en euros", rB.respuesta.includes("€"));
    ok("el bot de A sigue en pesos", rA.respuesta.includes("$") && !rA.respuesta.includes("€"));
    ok("el bot de B no habla de anatomía ni de su gente", !/anatom|laura|gomez/i.test(rB.respuesta));
    ok("el bot de A sigue con sus datos", !rA.respuesta.includes("prueba.aislamiento.mp") && !rA.respuesta.includes("1.111"));
  }

  console.log(fallas ? `\n${fallas} verificaciones fallaron.` : "\nTodas las verificaciones pasaron.");
  if (fallas) process.exitCode = 1;
}

async function limpiar() {
  const { admin, dbDeOrg, orgA, orgB } = await cargar();
  // Lo de prueba en Anatomía: la alumna, sus clases y su charla.
  const dbA = dbDeOrg(orgA)!;
  const { data: alumnosA } = await dbA.from("alumnos").select("id").eq("telefono", CONTACTO);
  const idsA = (alumnosA ?? []).map((a) => a.id);
  if (idsA.length) {
    const { data: vinc } = await dbA.from("clase_alumnos").select("clase_id").in("alumno_id", idsA);
    const clases = [...new Set((vinc ?? []).map((v) => v.clase_id))];
    if (clases.length) await dbA.from("clases").delete().in("id", clases);
    await dbA.from("alumnos").delete().in("id", idsA);
  }
  // (El costo de los mensajes de prueba queda en bot_uso: es gasto real.)
  await dbA.from("bot_conversaciones").delete().eq("contacto", CONTACTO);

  // La academia de prueba entera: primero sus filas, después ella.
  if (orgB) {
    const dbB = dbDeOrg(orgB)!;
    for (const t of [
      "bot_mensajes", "bot_conversaciones", "bot_mensajes_recibidos", "bot_uso", "bot_saldo",
      "reagendas_grupales_respuestas", "reagendas_grupales", "solicitudes_union", "seguimientos",
      "reportes", "pagos", "clase_alumnos", "clases", "alumnos", "temas", "tarifas", "solicitudes",
      "carreras", "dias_sin_clase", "precios", "bot_config", "push_suscripciones",
      "biblioteca_fragmentos", "biblioteca_documentos",
    ]) {
      const { error } = await dbB.from(t).delete().not("organizacion_id", "is", null);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    await admin.from("whatsapp_numeros").delete().eq("organizacion_id", orgB);
    await admin.from("organizacion_dominios").delete().eq("organizacion_id", orgB);
    const { error } = await admin.from("organizaciones").delete().eq("id", orgB);
    if (error) throw new Error(`organización: ${error.message}`);
  }
  console.log(`Limpio: ${idsA.length} alumna(s) de prueba en Anatomía y ${orgB ? "la academia de prueba" : "nada de la academia de prueba (no existía)"}.`);
}

const args = process.argv.slice(2);
const tarea = args.includes("--preparar")
  ? preparar()
  : args.includes("--verificar")
    ? verificar(args.includes("--con-bot"))
    : args.includes("--limpiar")
      ? limpiar()
      : Promise.reject(new Error("Usá --preparar, --verificar o --limpiar."));
tarea.catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
