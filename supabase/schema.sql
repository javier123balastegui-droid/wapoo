-- ============================================================
-- Academia Demo — esquema de la base de datos
-- Pegá TODO esto en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin romper nada.
-- ============================================================

-- Perfiles (extiende auth.users con nombre y rol)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text,
  rol text not null default 'PROFE' check (rol in ('ADMIN','PROFE')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.alumnos (
  id text primary key,
  nombre text not null,
  carrera text not null default '',
  email text,
  telefono text,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists public.temas (
  id text primary key,
  titulo text not null,
  descripcion text not null default '',
  contenido text not null default '',
  recursos jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.clases (
  id text primary key,
  tipo text not null check (tipo in ('GRUPAL','INDIVIDUAL')),
  tema_id text references public.temas(id) on delete set null,
  fecha date not null,
  inicio_min int not null,
  duracion int not null,
  profe_id uuid references public.profiles(id) on delete set null,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists public.clase_alumnos (
  clase_id text references public.clases(id) on delete cascade,
  alumno_id text references public.alumnos(id) on delete cascade,
  primary key (clase_id, alumno_id)
);

create table if not exists public.pagos (
  id text primary key,
  clase_id text references public.clases(id) on delete cascade,
  alumno_id text references public.alumnos(id) on delete cascade,
  estado text not null default 'SIN_PAGAR' check (estado in ('SIN_PAGAR','SENADO','PAGADO')),
  monto numeric,
  fecha date,
  unique (clase_id, alumno_id)
);

create table if not exists public.tarifas (
  id text primary key,
  profe_id uuid references public.profiles(id) on delete cascade unique,
  valor_grupal numeric not null default 0,
  valor_individual numeric not null default 0,
  vigente_desde date not null default current_date
);

create table if not exists public.reportes (
  id text primary key,
  clase_id text references public.clases(id) on delete cascade unique,
  metodo text not null default '',
  tema_dado text not null default '',
  observaciones text not null default '',
  por_alumno jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now()
);

create table if not exists public.solicitudes (
  id text primary key,
  nombre text not null,
  contacto text not null,
  carrera text not null default '',
  tema_interes text not null default '',
  preferencia text not null default 'INDISTINTO',
  mensaje text,
  estado text not null default 'NUEVA' check (estado in ('NUEVA','CONTACTADA','CONVERTIDA','DESCARTADA')),
  creado_en timestamptz not null default now()
);

-- ¿El usuario actual es ADMIN?
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'ADMIN');
$$;

-- Crear el perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'rol', 'PROFE')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seguridad por filas (RLS)
alter table public.profiles enable row level security;
alter table public.alumnos enable row level security;
alter table public.temas enable row level security;
alter table public.clases enable row level security;
alter table public.clase_alumnos enable row level security;
alter table public.pagos enable row level security;
alter table public.tarifas enable row level security;
alter table public.reportes enable row level security;
alter table public.solicitudes enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "alumnos_all" on public.alumnos;
create policy "alumnos_all" on public.alumnos for all to authenticated using (true) with check (true);
drop policy if exists "temas_all" on public.temas;
create policy "temas_all" on public.temas for all to authenticated using (true) with check (true);
drop policy if exists "clases_all" on public.clases;
create policy "clases_all" on public.clases for all to authenticated using (true) with check (true);
drop policy if exists "clase_alumnos_all" on public.clase_alumnos;
create policy "clase_alumnos_all" on public.clase_alumnos for all to authenticated using (true) with check (true);
drop policy if exists "reportes_all" on public.reportes;
create policy "reportes_all" on public.reportes for all to authenticated using (true) with check (true);

-- Pagos y tarifas: SOLO admin (candado de finanzas a nivel base de datos)
drop policy if exists "pagos_admin" on public.pagos;
create policy "pagos_admin" on public.pagos for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tarifas_admin" on public.tarifas;
create policy "tarifas_admin" on public.tarifas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Solicitudes: el público puede INSERTAR (formulario); solo admin lee/edita/borra
drop policy if exists "solicitudes_insert_public" on public.solicitudes;
create policy "solicitudes_insert_public" on public.solicitudes for insert to anon, authenticated with check (true);
drop policy if exists "solicitudes_admin_read" on public.solicitudes;
create policy "solicitudes_admin_read" on public.solicitudes for select to authenticated using (public.is_admin());
drop policy if exists "solicitudes_admin_update" on public.solicitudes;
create policy "solicitudes_admin_update" on public.solicitudes for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "solicitudes_admin_delete" on public.solicitudes;
create policy "solicitudes_admin_delete" on public.solicitudes for delete to authenticated using (public.is_admin());

-- Temario inicial de ejemplo (lo podés editar o borrar después)
insert into public.temas (id, titulo, descripcion, contenido, recursos) values
  ('t1','Cráneo','Huesos del cráneo, suturas y forámenes de la base.', E'Objetivos:\n- Identificar los huesos del neurocráneo y viscerocráneo.\n- Reconocer las principales suturas.\n- Ubicar los forámenes de la base y su contenido.','[]'::jsonb),
  ('t2','Oído','Anatomía del oído externo, medio e interno.', E'Objetivos:\n- Describir el oído externo, medio e interno.\n- Comprender la cadena de huesecillos.','[]'::jsonb),
  ('t3','Sistema nervioso central','Organización del encéfalo y la médula espinal.', E'Objetivos:\n- Identificar lóbulos y surcos principales.\n- Reconocer los núcleos de la base.','[]'::jsonb),
  ('t4','Osteología de miembro superior','Clavícula, escápula, húmero, antebrazo y mano.', E'Objetivos:\n- Reconocer los accidentes óseos relevantes.\n- Relacionar las inserciones musculares principales.','[]'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- NUEVO (jun 2026): ficha evolutiva por alumno + admin docente.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente,
-- se puede correr más de una vez sin romper nada).
-- ============================================================

-- Ficha evolutiva: seguimiento por alumno, independiente de la agenda.
-- La cargan y editan profes y admin desde la ficha del alumno.
create table if not exists public.seguimientos (
  id text primary key,
  alumno_id text references public.alumnos(id) on delete cascade,
  fecha date not null default current_date,
  tema text not null default '',
  desempeno text not null default '',
  a_reforzar text not null default '',
  autor_id uuid references public.profiles(id) on delete set null,
  autor_nombre text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.seguimientos enable row level security;
drop policy if exists "seguimientos_all" on public.seguimientos;
create policy "seguimientos_all" on public.seguimientos
  for all to authenticated using (true) with check (true);

-- Un ADMIN puede además dar clases (aparece como profesor asignable).
alter table public.profiles
  add column if not exists es_profe boolean not null default false;

-- Laura Gómez: directora + administración + profesora.
update public.profiles set es_profe = true
  where email = 'contacto@academia-demo.test';

-- ============================================================
-- NUEVO (jun 2026): acceso de alumnos al portal SIN cuenta.
-- Cada alumno tiene un código personal con el que entra a /alumno.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.alumnos
  add column if not exists codigo_acceso text
  default lower(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
-- Genera código a los alumnos que aún no tengan uno.
update public.alumnos
  set codigo_acceso =
    lower(substr(md5(random()::text || id || clock_timestamp()::text), 1, 12))
  where codigo_acceso is null;
create unique index if not exists alumnos_codigo_acceso_key
  on public.alumnos(codigo_acceso);

-- ============================================================
-- NUEVO (jun 2026): pedidos para unirse a una clase grupal.
-- El alumno PIDE lugar; el admin aprueba (lo inscribe) o rechaza
-- (después de consultar con los alumnos ya inscriptos).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
create table if not exists public.solicitudes_union (
  id text primary key,
  clase_id text references public.clases(id) on delete cascade,
  alumno_id text references public.alumnos(id) on delete cascade,
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE','APROBADA','RECHAZADA')),
  creado_en timestamptz not null default now(),
  unique (clase_id, alumno_id)
);
alter table public.solicitudes_union enable row level security;
drop policy if exists "solicitudes_union_all" on public.solicitudes_union;
create policy "solicitudes_union_all" on public.solicitudes_union
  for all to authenticated using (true) with check (true);

-- ============================================================
-- NUEVO (jun 2026): precios al alumno (clase individual, grupal y seña).
-- Editables por el admin desde Finanzas. Fila única (id = 'unico').
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
create table if not exists public.precios (
  id text primary key default 'unico',
  valor_individual numeric not null default 0,
  valor_grupal numeric not null default 0,
  valor_sena numeric not null default 0,
  actualizado_en timestamptz not null default now()
);
insert into public.precios (id) values ('unico') on conflict (id) do nothing;
alter table public.precios enable row level security;
drop policy if exists "precios_admin" on public.precios;
create policy "precios_admin" on public.precios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- NUEVO (jul 2026): estado de realización de cada clase.
-- Lo marca el admin; los profes solo lo ven.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.clases
  add column if not exists estado_realizacion text not null default 'PENDIENTE'
  check (estado_realizacion in
    ('PENDIENTE','REALIZADA','REAGENDADA','CANCELADA','AUSENTE'));

-- NUEVO: el precio grupal depende de la cantidad de alumnos.
--   valor_grupal_2 = grupal de 2 (precio por alumno)
--   valor_grupal_3 = grupal de 3 o más (precio por alumno)
alter table public.precios
  add column if not exists valor_grupal_2 numeric not null default 0;
alter table public.precios
  add column if not exists valor_grupal_3 numeric not null default 0;
-- Si ya habías cargado un valor grupal, lo uso como punto de partida.
update public.precios
  set valor_grupal_2 = case when valor_grupal_2 = 0 then valor_grupal else valor_grupal_2 end,
      valor_grupal_3 = case when valor_grupal_3 = 0 then valor_grupal else valor_grupal_3 end
  where id = 'unico';

-- ============================================================
-- NUEVO (jul 2026): bot de atención por WhatsApp.
-- Guarda las conversaciones y el historial de mensajes para que el bot
-- tenga memoria de cada charla. Lo toca SOLO el backend del bot (service key).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
create table if not exists public.bot_conversaciones (
  id text primary key,
  contacto text not null unique,
  estado text not null default 'BOT' check (estado in ('BOT','HUMANO')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.bot_mensajes (
  id text primary key,
  conversacion_id text not null
    references public.bot_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('user','assistant')),
  contenido text not null,
  creado_en timestamptz not null default now()
);
create index if not exists bot_mensajes_conversacion_idx
  on public.bot_mensajes (conversacion_id, creado_en);

-- RLS: el bot entra con la service key (que saltea RLS), así que nadie más
-- puede leer las conversaciones. Igual dejamos una policy solo-admin por si
-- más adelante querés verlas desde el panel.
alter table public.bot_conversaciones enable row level security;
alter table public.bot_mensajes enable row level security;
drop policy if exists "bot_conversaciones_admin" on public.bot_conversaciones;
create policy "bot_conversaciones_admin" on public.bot_conversaciones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "bot_mensajes_admin" on public.bot_mensajes;
create policy "bot_mensajes_admin" on public.bot_mensajes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- NUEVO (jul 2026): coordinación grupal de reagenda (bot de WhatsApp).
-- Cuando un integrante de una clase grupal pide reagendar, el bot consulta a
-- cada uno de los demás. Acá se guarda el estado de esa consulta hasta que
-- respondan todos. Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
create table if not exists public.reagendas_grupales (
  id text primary key,
  clase_id text references public.clases(id) on delete cascade,
  iniciador_alumno_id text references public.alumnos(id) on delete cascade,
  prop_fecha date not null,
  prop_inicio_min int not null,
  prop_duracion int not null,
  estado text not null default 'EN_CURSO'
    check (estado in ('EN_CURSO','RESUELTA','CANCELADA')),
  creado_en timestamptz not null default now()
);

create table if not exists public.reagendas_grupales_respuestas (
  reagenda_id text references public.reagendas_grupales(id) on delete cascade,
  alumno_id text references public.alumnos(id) on delete cascade,
  respuesta text not null default 'PENDIENTE'
    check (respuesta in ('PENDIENTE','MOVER','QUEDARSE')),
  respondido_en timestamptz,
  primary key (reagenda_id, alumno_id)
);

alter table public.reagendas_grupales enable row level security;
alter table public.reagendas_grupales_respuestas enable row level security;
drop policy if exists "reagendas_grupales_admin" on public.reagendas_grupales;
create policy "reagendas_grupales_admin" on public.reagendas_grupales
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "reagendas_grupales_resp_admin" on public.reagendas_grupales_respuestas;
create policy "reagendas_grupales_resp_admin" on public.reagendas_grupales_respuestas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- NUEVO (jul 2026): recordatorios automáticos de clase (bot de WhatsApp).
-- Marca si ya se envió el recordatorio de una clase, para no mandarlo repetido.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.clases
  add column if not exists recordatorio_enviado boolean not null default false;

-- ============================================================
-- NUEVO (jul 2026): teléfono de WhatsApp del profe (para avisos de clases).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.profiles
  add column if not exists telefono text;

-- ============================================================
-- NUEVO (jul 2026): notificaciones push al celular (equipo).
-- Guarda a qué celular hay que mandarle la notificación. Cada fila es un
-- navegador/celular donde alguien del equipo tocó "Activar notificaciones".
-- Una misma persona puede tener varias (celular + compu): por eso la clave
-- única es el endpoint, no el profile_id.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
create table if not exists public.push_suscripciones (
  id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- URL que da el navegador para mandarle push a ESE dispositivo.
  endpoint text not null unique,
  -- Claves de cifrado del dispositivo (las da el navegador al suscribirse).
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

create index if not exists push_suscripciones_profile_idx
  on public.push_suscripciones(profile_id);

-- ============================================================
-- NUEVO (jul 2026): compensación al profe por clase caída.
-- Cuando el alumno cancela a último momento, no avisa o no se conecta, la
-- clase no se cobra (el alumno pierde la seña) pero al profe se le paga igual
-- una compensación fija por haber reservado el horario.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.tarifas
  add column if not exists valor_cancelada_individual numeric not null default 2500;
alter table public.tarifas
  add column if not exists valor_cancelada_grupal numeric not null default 4000;

alter table public.push_suscripciones enable row level security;

-- Cada uno maneja SOLO sus propias suscripciones. El envío corre con la
-- service key (saltea RLS), así que no necesita policy de lectura para todos.
drop policy if exists "push_suscripciones_propias" on public.push_suscripciones;
create policy "push_suscripciones_propias" on public.push_suscripciones
  for all to authenticated using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================
-- NUEVO (sep 2026): segundo recordatorio de clase.
-- Ahora el bot avisa DOS veces por clase: la noche anterior (20 hs) y la
-- mañana del mismo día (9 hs). Cada aviso necesita su propia marca, o el
-- primero en salir dejaría la clase como "ya recordada" y el segundo nunca
-- se mandaría.
--   recordatorio_enviado      -> aviso de la noche anterior (ya existía)
--   recordatorio_hoy_enviado  -> aviso del mismo día (nuevo)
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.clases
  add column if not exists recordatorio_hoy_enviado boolean not null default false;

-- ============================================================
-- NUEVO (sep 2026): la directora responde desde la plataforma.
-- Marca quién escribió cada mensaje del lado del negocio: el bot o una
-- persona. Los dos se siguen guardando con rol 'assistant' —así el bot lee la
-- conversación completa cuando retoma el control y no se pierde de lo que
-- dijo la directora—, pero el panel los pinta distinto.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.bot_mensajes
  add column if not exists origen text not null default 'BOT';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bot_mensajes_origen_check'
  ) then
    alter table public.bot_mensajes
      add constraint bot_mensajes_origen_check
      check (origen in ('BOT','HUMANO'));
  end if;
end $$;

-- ============================================================
-- NUEVO (sep 2026): mensaje de "¿cómo te fue?" después de la clase.
-- Marca si ya se le preguntó al alumno, para no repetir.
--
-- El truco de los dos ALTER es a propósito: al crear la columna con default
-- TRUE, todas las clases que YA existen quedan marcadas como preguntadas y no
-- reciben nada. Después se baja el default a FALSE, así las clases nuevas sí
-- entran. Sin esto, la primera corrida le escribiría a todos los alumnos por
-- cada clase histórica.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
alter table public.clases
  add column if not exists feedback_enviado boolean not null default true;

alter table public.clases
  alter column feedback_enviado set default false;

-- ============================================================
-- NUEVO (sep 2026): biblioteca de anatomía para el bot.
--
-- Guarda el texto de los libros de referencia partido en fragmentos, para que
-- el bot pueda buscar el pasaje que corresponde a la pregunta de una alumna y
-- explicarlo con sus propias palabras.
--
-- La búsqueda usa el buscador de texto que Postgres ya trae, configurado en
-- español. No hace falta ningún servicio externo ni otra clave de API.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================
create table if not exists public.biblioteca_documentos (
  id text primary key,
  titulo text not null,
  autor text not null default '',
  fragmentos int not null default 0,
  creado_en timestamptz not null default now()
);

create table if not exists public.biblioteca_fragmentos (
  id text primary key,
  documento_id text not null
    references public.biblioteca_documentos(id) on delete cascade,
  orden int not null,
  pagina int,
  contenido text not null
);

-- Columna calculada: Postgres mantiene solo el índice de búsqueda a partir del
-- contenido, así que nunca puede quedar desincronizado.
alter table public.biblioteca_fragmentos
  add column if not exists busqueda tsvector
  generated always as (to_tsvector('spanish', contenido)) stored;

create index if not exists biblioteca_fragmentos_busqueda_idx
  on public.biblioteca_fragmentos using gin (busqueda);
create index if not exists biblioteca_fragmentos_doc_idx
  on public.biblioteca_fragmentos (documento_id, orden);

-- Búsqueda ordenada por relevancia. La usa el bot cuando una alumna pregunta
-- algo de anatomía.
create or replace function public.buscar_biblioteca(
  consulta text,
  limite int default 6
)
returns table (
  fragmento_id text,
  documento_titulo text,
  pagina int,
  contenido text,
  relevancia real
)
language sql
stable
as $$
  select
    f.id,
    d.titulo,
    f.pagina,
    f.contenido,
    ts_rank(f.busqueda, websearch_to_tsquery('spanish', consulta)) as relevancia
  from public.biblioteca_fragmentos f
  join public.biblioteca_documentos d on d.id = f.documento_id
  where f.busqueda @@ websearch_to_tsquery('spanish', consulta)
  order by relevancia desc
  limit limite;
$$;

alter table public.biblioteca_documentos enable row level security;
alter table public.biblioteca_fragmentos enable row level security;
drop policy if exists "biblioteca_docs_admin" on public.biblioteca_documentos;
create policy "biblioteca_docs_admin" on public.biblioteca_documentos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "biblioteca_frag_admin" on public.biblioteca_fragmentos;
create policy "biblioteca_frag_admin" on public.biblioteca_fragmentos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- NUEVO (sep 2026): comprobantes de pago que llegan por WhatsApp.
--
-- Cuando una alumna manda una foto o un PDF, el archivo se guarda en el
-- depósito "comprobantes" y queda pegado a su mensaje en bot_mensajes.
--
-- El depósito es PRIVADO y no tiene políticas de lectura: nadie lo puede
-- abrir desde el navegador. Solo el servidor (service role) lee y escribe, y
-- el panel muestra cada archivo con un enlace firmado que vence solo, generado
-- después de comprobar que quien mira es admin. Los profes no llegan nunca.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

alter table public.bot_mensajes add column if not exists adjunto_path text;
alter table public.bot_mensajes add column if not exists adjunto_tipo text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  10485760, -- 10 MB: sobra para una foto o el PDF de un banco
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- ============================================================
-- NUEVO (sep 2026): mensajes de WhatsApp ya recibidos.
--
-- Meta reenvía un mensaje cuando cree que no le contestamos a tiempo. Acá se
-- anota el id de cada mensaje (wamid) al recibirlo: si vuelve a llegar, el
-- bot lo ignora en vez de responder dos veces. Solo lo usa el servidor.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.bot_mensajes_recibidos (
  wamid text primary key,
  recibido_en timestamptz not null default now()
);
alter table public.bot_mensajes_recibidos enable row level security;

-- ============================================================
-- NUEVO (sep 2026): registro de acciones del bot en cada respuesta.
--
-- Qué herramientas usó el bot en ese turno (agendó, dio de alta, avisó...).
-- El bot lo vuelve a leer en los mensajes siguientes para no repetir
-- acciones ni contradecirse. El alumno nunca lo ve.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

alter table public.bot_mensajes add column if not exists acciones text;

-- ============================================================
-- NUEVO (sep 2026): panel de control del bot.
--
-- Qué puede mandar el bot por WhatsApp. Se maneja desde Panel → Bot, sin
-- deploys. Arranca TODO APAGADO: nada sale hasta que la dirección lo prenda.
--   modo: APAGADO (no sale nada) · PRUEBA (solo a los números de prueba) ·
--         ENCENDIDO (a todos).
--   Y una llave por cada tipo de mensaje.
-- Solo lo usa el servidor (sin políticas: nadie lo lee desde el navegador).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.bot_config (
  id text primary key default 'unico' check (id = 'unico'),
  modo text not null default 'APAGADO' check (modo in ('APAGADO','PRUEBA','ENCENDIDO')),
  responder boolean not null default false,
  recordatorios boolean not null default false,
  post_clase boolean not null default false,
  agenda_profes boolean not null default false,
  numeros_prueba text not null default '',
  actualizado_en timestamptz not null default now()
);
alter table public.bot_config enable row level security;
insert into public.bot_config (id) values ('unico') on conflict (id) do nothing;

-- ============================================================
-- NUEVO (oct 2026): carreras editables desde el panel.
--
-- Antes la lista de carreras estaba escrita en el código y había que tocar
-- el proyecto para sumar una. Ahora se maneja desde Panel → Carreras, y la
-- usan el alta de alumnos y el formulario de inscripción de la web.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.carreras (
  id text primary key,
  nombre text not null unique,
  -- Una carrera que ya no se ofrece se desactiva en vez de borrarse, para no
  -- tocar los alumnos que ya la tienen cargada.
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.carreras enable row level security;
drop policy if exists "carreras_all" on public.carreras;
create policy "carreras_all" on public.carreras for all to authenticated using (true) with check (true);

insert into public.carreras (id, nombre) values
  ('medicina','Medicina'),
  ('kinesiologia','Kinesiología'),
  ('enfermeria','Enfermería'),
  ('odontologia','Odontología'),
  ('fonoaudiologia','Fonoaudiología'),
  ('nutricion','Nutrición'),
  ('psicologia','Psicología'),
  ('obstetricia','Obstetricia'),
  ('bioquimica','Bioquímica'),
  ('instrumentacion-quirurgica','Instrumentación quirúrgica'),
  ('terapia-ocupacional','Terapia ocupacional'),
  ('profesorado-educacion-fisica','Profesorado de educación física'),
  ('bioimagenes','Bioimágenes')
on conflict (id) do nothing;

-- ============================================================
-- NUEVO (oct 2026): gasto del bot y saldo cargado.
--
-- Cada respuesta del bot anota lo que consumió (tokens y búsquedas) y su
-- costo estimado. En Panel → Bot se ve el gasto por día y, si se carga
-- cuánto saldo se puso en Claude, cuánto queda y para cuántos días alcanza.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.bot_uso (
  id bigserial primary key,
  creado_en timestamptz not null default now(),
  fecha date not null default (now() at time zone 'America/Argentina/Cordoba')::date,
  modelo text not null default '',
  entrada integer not null default 0,
  salida integer not null default 0,
  cache_lectura integer not null default 0,
  cache_escritura integer not null default 0,
  busquedas integer not null default 0,
  -- Costo estimado en dólares, con la lista de precios del modelo.
  costo numeric(10,6) not null default 0
);
create index if not exists bot_uso_fecha_idx on public.bot_uso (fecha);
alter table public.bot_uso enable row level security;

-- Cada carga de saldo que se hace en Claude. El saldo que queda se calcula
-- restándole a la última carga lo gastado desde esa fecha.
create table if not exists public.bot_saldo (
  id bigserial primary key,
  monto numeric(10,2) not null,
  cargado_en timestamptz not null default now(),
  nota text not null default ''
);
alter table public.bot_saldo enable row level security;

-- ============================================================
-- NUEVO (oct 2026): link de la clase (Google Meet).
--
-- Es el mismo para todas las clases. El bot se lo manda al alumno cuando
-- confirma la seña, cuando pregunta por él y en los recordatorios. Se edita
-- en Panel → Bot, sin tocar código.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

alter table public.bot_config add column if not exists enlace_clase text not null default '';

-- ============================================================
-- NUEVO (oct 2026): días sin clase.
--
-- Días en los que no se da clase (el profe se toma el día, feriados, etc.).
-- El bot no agenda ahí y en la web del alumno no aparecen horarios. Se
-- cargan en Panel → Días sin clase.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.dias_sin_clase (
  fecha date primary key,
  motivo text not null default '',
  creado_en timestamptz not null default now()
);
alter table public.dias_sin_clase enable row level security;
drop policy if exists "dias_sin_clase_all" on public.dias_sin_clase;
create policy "dias_sin_clase_all" on public.dias_sin_clase for all to authenticated using (true) with check (true);

-- ============================================================
-- NUEVO (oct 2026): zona horaria del alumno.
--
-- La hora real de la clase sigue siendo la de Argentina (la agenda del profe).
-- Esto es solo para MOSTRARLE a cada alumno su hora local: una alumna en
-- México ve 15:00 donde acá son las 18:00. Vacío = Argentina.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

alter table public.alumnos add column if not exists zona_horaria text not null default '';

-- ============================================================
-- SEGURIDAD (oct 2026): el rol ya no sale del metadata del usuario.
--
-- Problema que cerramos: handle_new_user() tomaba el rol de
-- raw_user_meta_data, que lo controla QUIEN SE REGISTRA. Con el registro
-- publico abierto en Supabase (disable_signup = false), cualquiera podia
-- llamar a signUp con { rol: "ADMIN" } y quedar administrador: acceso a los
-- datos personales de las alumnas, a los comprobantes de pago, a las finanzas
-- y a todas las conversaciones del bot.
--
-- La confirmacion por email no alcanzaba como defensa: el trigger se dispara
-- al insertarse la cuenta, antes de confirmar, y el atacante confirma con su
-- propio correo.
--
-- Se audito al momento del arreglo: solo existian las 3 cuentas legitimas, o
-- sea que no fue explotado.
--
-- Ahora todo perfil nace PROFE e INACTIVO. Como lib/auth.ts exige activo para
-- dar sesion, un autoregistrado no entra a ningun lado. El rol y la activacion
-- los escribe app/actions/equipo.ts, que es el unico camino que pasa por
-- requireAdmin().
--
-- OJO: esto es una de dos capas. La otra es cerrar el registro publico en
-- Supabase (Authentication -> Sign In / Providers -> desactivar "Allow new
-- users to sign up"). Con esta migracion un autoregistrado no consigue acceso;
-- con el registro cerrado, ni siquiera puede crear la cuenta.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, rol, activo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    'PROFE',  -- nunca del metadata: lo controla quien se registra
    false     -- sin acceso hasta que un admin lo habilite
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- NUEVO (oct 2026): organizaciones (multi-cliente, paso 1).
--
-- Cada academia que usa la plataforma es una organización. Acá vive lo que
-- antes estaba escrito en el código para Academia Demo: nombre,
-- directora, contacto, horarios, reglas de duración y de reagenda, moneda,
-- zona horaria y colores. Precios y bot_config siguen en sus tablas y pasan
-- a ser por organización en el paso 2.
--
-- Horarios de atención al alumno: un objeto por día de la semana
-- ("0" = domingo … "6" = sábado) con apertura y cierre en minutos desde
-- medianoche. Un día que no figura está cerrado.
--
-- Solo lo usa el servidor (sin políticas: nadie lo lee desde el navegador).
-- Todavía no lo lee el código: queda cargado para los pasos siguientes.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre text not null,
  directora text not null default '',
  materia text not null default '',
  descripcion text not null default '',
  instagram_url text not null default '',
  whatsapp_publico text not null default '',
  logo_url text not null default '',
  colores jsonb not null default '{}'::jsonb check (jsonb_typeof(colores) = 'object'),
  zona_horaria text not null default 'America/Argentina/Cordoba',
  moneda text not null default 'ARS' check (moneda ~ '^[A-Z]{3}$'),
  locale text not null default 'es-AR',
  horarios_atencion jsonb not null default '{}'::jsonb check (jsonb_typeof(horarios_atencion) = 'object'),
  panel_apertura integer not null default 480 check (panel_apertura between 0 and 1440),
  panel_cierre integer not null default 1320 check (panel_cierre between 0 and 1440),
  duracion_minima integer not null default 60 check (duracion_minima > 0),
  paso_duracion integer not null default 30 check (paso_duracion > 0),
  slot_granularidad integer not null default 15 check (slot_granularidad > 0),
  pausa_sugerida integer not null default 15 check (pausa_sugerida >= 0),
  -- Anticipación mínima para reagendar sin perder la seña, y la tolerancia
  -- sobre ese mínimo (hoy 3 h con 15 min de tolerancia → corte a 2 h 45 min).
  reagenda_anticipacion_min integer not null default 180 check (reagenda_anticipacion_min >= 0),
  reagenda_tolerancia_min integer not null default 15 check (reagenda_tolerancia_min >= 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (panel_apertura < panel_cierre)
);
alter table public.organizaciones enable row level security;

insert into public.organizaciones (
  slug, nombre, directora, materia, descripcion,
  instagram_url, whatsapp_publico, logo_url, colores, horarios_atencion
) values (
  'academia-demo',
  'Academia Demo',
  'Laura Gómez',
  'Anatomía',
  'Clases de apoyo de anatomía, en general y específicas para cualquier carrera que tenga anatomía como materia.',
  'https://www.instagram.com/academia_demo',
  '5491100000000',
  '',
  '{
    "cream": "#fbf7f4", "canvas": "#ae6675", "canvas-deep": "#985365",
    "surface": "#fffdfc", "surface-rose": "#fdf6f4",
    "blush": "#e8b4b8", "blush-deep": "#d99ba0", "blush-soft": "#f5e4e3",
    "gold": "#c9a35b", "copper": "#b08d57", "beige": "#e5d5c5",
    "ink": "#3a2e2a", "ink-soft": "#6f6058", "ink-muted": "#9a8c84",
    "line": "#ece2da", "line-warm": "#e3d3c4"
  }'::jsonb,
  '{
    "1": {"apertura": 840, "cierre": 1320},
    "2": {"apertura": 840, "cierre": 1320},
    "3": {"apertura": 840, "cierre": 1320},
    "4": {"apertura": 840, "cierre": 1320},
    "5": {"apertura": 840, "cierre": 1320},
    "6": {"apertura": 480, "cierre": 1260}
  }'::jsonb
) on conflict (slug) do nothing;

-- ============================================================
-- NUEVO (oct 2026): organizacion_id en todas las tablas (multi-cliente,
-- paso 2).
--
-- Cada fila pasa a pertenecer a una organización. Las existentes quedan en
-- Academia Demo. La columna es obligatoria pero, por ahora, tiene
-- como valor por defecto esa misma organización: el código de hoy no la
-- manda en ningún insert y tiene que seguir andando igual.
--
-- OJO: ese valor por defecto es PROVISORIO. Se saca en el paso 3, cuando el
-- código pase la organización en cada escritura. Si quedara, los datos de
-- una academia nueva caerían en silencio en esta.
--
-- Las unicidades globales (bot_conversaciones.contacto, carreras.nombre,
-- dias_sin_clase.fecha, alumnos.codigo_acceso) y las filas 'unico' de
-- bot_config y precios siguen como están: el código actual depende de
-- ellas. Pasan a ser por organización en el paso 3, junto con el código.
--
-- Corre todo en una sola transacción: o queda completo o no cambia nada.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create or replace function public.org_por_defecto()
returns uuid language sql stable set search_path = public as $$
  select id from public.organizaciones where slug = 'academia-demo';
$$;

do $$
declare
  t text;
  org uuid := public.org_por_defecto();
begin
  if org is null then
    raise exception 'Falta la organización academia-demo: corré primero el bloque del paso 1';
  end if;

  foreach t in array array[
    'profiles', 'alumnos', 'temas', 'clases', 'clase_alumnos', 'pagos',
    'tarifas', 'reportes', 'solicitudes', 'seguimientos', 'solicitudes_union',
    'precios', 'bot_conversaciones', 'bot_mensajes', 'reagendas_grupales',
    'reagendas_grupales_respuestas', 'push_suscripciones',
    'biblioteca_documentos', 'biblioteca_fragmentos', 'bot_mensajes_recibidos',
    'bot_config', 'carreras', 'bot_uso', 'bot_saldo', 'dias_sin_clase'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'No existe la tabla public.%: falta correr algún bloque anterior', t;
    end if;
    execute format('alter table public.%I add column if not exists organizacion_id uuid', t);
    execute format('alter table public.%I alter column organizacion_id set default public.org_por_defecto()', t);
    execute format('update public.%I set organizacion_id = $1 where organizacion_id is null', t) using org;
    execute format('alter table public.%I alter column organizacion_id set not null', t);
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || t)::regclass and conname = t || '_organizacion_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organizacion_id) references public.organizaciones(id) on delete restrict',
        t, t || '_organizacion_id_fkey');
    end if;
    execute format('create index if not exists %I on public.%I (organizacion_id)', t || '_organizacion_id_idx', t);
  end loop;
end $$;

-- ============================================================
-- NUEVO (oct 2026): aislamiento por organización (multi-cliente, paso 3a).
--
-- 1. org_actual(): la academia del usuario logueado (de su perfil activo).
-- 2. Reglas de acceso: cada una suma "organizacion_id = org_actual()". Sin
--    esto, cualquier usuario logueado veía los datos de todas las academias.
-- 3. Lo que era único en toda la base pasa a ser único por academia:
--    carreras (id y nombre), bot_conversaciones.contacto, dias_sin_clase.fecha.
--    bot_config y precios dejan de ser la fila 'unico' y pasan a ser una
--    fila por academia.
-- 4. buscar_biblioteca_org(): la búsqueda en los libros, de UNA academia.
--
-- Es compatible con el código que está andando hoy: todo sigue siendo de una
-- sola academia, así que nada cambia para el que usa la app. Se puede correr
-- con el bot encendido.
-- Corre en una sola transacción: o queda completo o no cambia nada.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create or replace function public.org_actual()
returns uuid language sql stable security definer set search_path = public as $$
  select organizacion_id from public.profiles where id = auth.uid() and activo;
$$;

do $$
declare
  p record;
begin
  -- 2. Reglas de acceso. Mismo criterio que antes (todos / solo admin /
  --    las propias), más la organización. "(select org_actual())" se evalúa
  --    una vez por consulta en vez de una vez por fila.
  for p in
    select * from (values
      ('profiles',            'profiles_select',               'select', 'true'),
      ('profiles',            'profiles_update_admin',         'update', 'public.is_admin()'),
      ('alumnos',             'alumnos_all',                   'all',    'true'),
      ('temas',               'temas_all',                     'all',    'true'),
      ('clases',              'clases_all',                    'all',    'true'),
      ('clase_alumnos',       'clase_alumnos_all',             'all',    'true'),
      ('reportes',            'reportes_all',                  'all',    'true'),
      ('seguimientos',        'seguimientos_all',              'all',    'true'),
      ('solicitudes_union',   'solicitudes_union_all',         'all',    'true'),
      ('carreras',            'carreras_all',                  'all',    'true'),
      ('dias_sin_clase',      'dias_sin_clase_all',            'all',    'true'),
      ('pagos',               'pagos_admin',                   'all',    'public.is_admin()'),
      ('tarifas',             'tarifas_admin',                 'all',    'public.is_admin()'),
      ('precios',             'precios_admin',                 'all',    'public.is_admin()'),
      ('solicitudes',         'solicitudes_admin_read',        'select', 'public.is_admin()'),
      ('solicitudes',         'solicitudes_admin_update',      'update', 'public.is_admin()'),
      ('solicitudes',         'solicitudes_admin_delete',      'delete', 'public.is_admin()'),
      ('bot_conversaciones',  'bot_conversaciones_admin',      'all',    'public.is_admin()'),
      ('bot_mensajes',        'bot_mensajes_admin',            'all',    'public.is_admin()'),
      ('reagendas_grupales',  'reagendas_grupales_admin',      'all',    'public.is_admin()'),
      ('reagendas_grupales_respuestas', 'reagendas_grupales_resp_admin', 'all', 'public.is_admin()'),
      ('biblioteca_documentos', 'biblioteca_docs_admin',       'all',    'public.is_admin()'),
      ('biblioteca_fragmentos', 'biblioteca_frag_admin',       'all',    'public.is_admin()'),
      ('push_suscripciones',  'push_suscripciones_propias',    'all',    'profile_id = auth.uid()')
    ) as v(tabla, nombre, comando, condicion)
  loop
    execute format('drop policy if exists %I on public.%I', p.nombre, p.tabla);
    execute format(
      'create policy %I on public.%I for %s to authenticated using (organizacion_id = (select public.org_actual()) and %s)%s',
      p.nombre, p.tabla, p.comando, p.condicion,
      case when p.comando in ('select', 'delete') then ''
           else format(' with check (organizacion_id = (select public.org_actual()) and %s)', p.condicion) end);
  end loop;

  -- El formulario público de inscripción (anónimo) sigue pudiendo cargar una
  -- solicitud. La organización la pone el servidor; la clave foránea impide
  -- inventar una que no existe.
  drop policy if exists "solicitudes_insert_public" on public.solicitudes;
  create policy "solicitudes_insert_public" on public.solicitudes
    for insert to anon, authenticated with check (true);

  -- En la base de producción había además 13 reglas p1..p13, copias de las
  -- originales con "using (true)" creadas a mano en algún momento. Como las
  -- reglas se suman, anulaban el filtro por academia. Se borraron el
  -- 20/10/2026; esto lo repite para cualquier base que las tenga.
  for p in
    select tablename as tabla, policyname as nombre from pg_policies
    where schemaname = 'public' and policyname ~ '^p[0-9]+$'
  loop
    execute format('drop policy if exists %I on public.%I', p.nombre, p.tabla);
  end loop;

  -- 3. Únicos por academia.
  alter table public.carreras drop constraint if exists carreras_nombre_key;
  if not exists (select 1 from pg_constraint where conname = 'carreras_org_nombre_key') then
    alter table public.carreras add constraint carreras_org_nombre_key unique (organizacion_id, nombre);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'carreras_pkey'
                 and array_length(conkey, 1) = 2) then
    alter table public.carreras drop constraint if exists carreras_pkey;
    alter table public.carreras add constraint carreras_pkey primary key (organizacion_id, id);
  end if;

  alter table public.bot_conversaciones drop constraint if exists bot_conversaciones_contacto_key;
  if not exists (select 1 from pg_constraint where conname = 'bot_conversaciones_org_contacto_key') then
    alter table public.bot_conversaciones
      add constraint bot_conversaciones_org_contacto_key unique (organizacion_id, contacto);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'dias_sin_clase_pkey'
                 and array_length(conkey, 1) = 2) then
    alter table public.dias_sin_clase drop constraint if exists dias_sin_clase_pkey;
    alter table public.dias_sin_clase add constraint dias_sin_clase_pkey primary key (organizacion_id, fecha);
  end if;

  -- bot_config y precios: una fila por academia. La fila 'unico' de hoy
  -- queda con ese id; las academias nuevas toman uno al azar.
  alter table public.bot_config drop constraint if exists bot_config_id_check;
  alter table public.bot_config alter column id set default gen_random_uuid()::text;
  if not exists (select 1 from pg_constraint where conname = 'bot_config_organizacion_key') then
    alter table public.bot_config add constraint bot_config_organizacion_key unique (organizacion_id);
  end if;
  alter table public.precios alter column id set default gen_random_uuid()::text;
  if not exists (select 1 from pg_constraint where conname = 'precios_organizacion_key') then
    alter table public.precios add constraint precios_organizacion_key unique (organizacion_id);
  end if;
end $$;

-- 4. Búsqueda en la biblioteca de UNA academia. La vieja (buscar_biblioteca)
--    sigue hasta que el código nuevo esté desplegado; se borra en el paso 3c.
create or replace function public.buscar_biblioteca_org(
  org uuid,
  consulta text,
  limite int default 6
)
returns table (
  fragmento_id text,
  documento_titulo text,
  pagina int,
  contenido text,
  relevancia real
)
language sql
stable
as $$
  select
    f.id,
    d.titulo,
    f.pagina,
    f.contenido,
    ts_rank(f.busqueda, websearch_to_tsquery('spanish', consulta)) as relevancia
  from public.biblioteca_fragmentos f
  join public.biblioteca_documentos d on d.id = f.documento_id
  where f.organizacion_id = org
    and d.organizacion_id = org
    and f.busqueda @@ websearch_to_tsquery('spanish', consulta)
  order by relevancia desc
  limit limite;
$$;

-- 5. Perfiles nuevos: en la academia que diga app_metadata.organizacion_id.
--    app_metadata solo lo escribe el servidor (app/actions/equipo.ts); el
--    metadata común lo controla quien se registra y no se mira. Sin academia
--    no se crea perfil, y sin perfil no se entra a ningún lado: un registro
--    público queda afuera. Rol y activación, igual que antes: PROFE e
--    inactivo hasta que un admin lo habilite.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  org uuid;
begin
  begin
    org := nullif(new.raw_app_meta_data->>'organizacion_id', '')::uuid;
  exception when invalid_text_representation then
    org := null;
  end;
  if org is null or not exists (select 1 from public.organizaciones where id = org) then
    return new;
  end if;
  insert into public.profiles (id, email, nombre, rol, activo, organizacion_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    'PROFE',  -- nunca del metadata: lo controla quien se registra
    false,    -- sin acceso hasta que un admin lo habilite
    org
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- NUEVO (oct 2026): sin academia por defecto (multi-cliente, paso 3c).
--
-- ⚠ CORRER RECIÉN DESPUÉS DE DESPLEGAR el código del paso 3 (el que pasa la
-- organización en cada escritura del servidor). Con el código viejo, el bot
-- y los crons dejarían de poder guardar.
--
-- Hasta ahora, una fila que se guardaba sin organización caía en la
-- academia por defecto (org_por_defecto). Con varias academias eso mezclaría datos
-- en silencio. Desde acá:
--   - Con sesión de usuario, la base completa la academia del usuario
--     (org_actual()), y las reglas de acceso no dejan poner otra.
--   - Sin sesión (servidor, bot, crons), el código la tiene que mandar. Si
--     no la manda, el guardado FALLA con error en vez de ir a parar a otra
--     academia.
-- También se borran org_por_defecto() y la búsqueda vieja de la biblioteca,
-- que buscaba en los libros de todas las academias.
-- Corre en una sola transacción: o queda completo o no cambia nada.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'alumnos', 'temas', 'clases', 'clase_alumnos', 'pagos',
    'tarifas', 'reportes', 'solicitudes', 'seguimientos', 'solicitudes_union',
    'precios', 'bot_conversaciones', 'bot_mensajes', 'reagendas_grupales',
    'reagendas_grupales_respuestas', 'push_suscripciones',
    'biblioteca_documentos', 'biblioteca_fragmentos', 'bot_mensajes_recibidos',
    'bot_config', 'carreras', 'bot_uso', 'bot_saldo', 'dias_sin_clase'
  ] loop
    execute format('alter table public.%I alter column organizacion_id set default public.org_actual()', t);
  end loop;
end $$;

drop function if exists public.org_por_defecto();
drop function if exists public.buscar_biblioteca(text, int);

-- ============================================================
-- NUEVO (oct 2026): números de WhatsApp por academia (multi-cliente, paso 4a).
--
-- Cada academia atiende con su número. Cuando llega un mensaje, el aviso de
-- Meta trae el id del número que lo recibió (metadata.phone_number_id): con
-- esta tabla se sabe de qué academia es, y se le contesta desde ese número.
--
-- Dos formas de conectar un número:
--   - En la cuenta de Meta de la plataforma (lo normal): token_secreto y
--     app_secret_secreto quedan vacíos y se usan WHATSAPP_TOKEN y
--     WHATSAPP_APP_SECRET de Vercel, compartidos.
--   - Con la cuenta de Meta de la academia: su token y el secreto de su app
--     se guardan CIFRADOS en Supabase Vault, y acá queda solo el id del
--     secreto. Se cargan con guardar_whatsapp_numero().
--
-- Nadie lo lee desde el navegador (sin políticas). Las dos funciones son
-- solo para el servidor (service_role): devuelven o guardan secretos.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create extension if not exists supabase_vault with schema vault;

create table if not exists public.whatsapp_numeros (
  phone_number_id text primary key,
  organizacion_id uuid not null unique references public.organizaciones(id) on delete restrict,
  numero_visible text not null default '',
  token_secreto uuid,
  app_secret_secreto uuid,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.whatsapp_numeros enable row level security;

-- Credenciales de un número, buscando por el id del número (webhook) o por
-- la academia (envíos). Los secretos vacíos vuelven null: el servidor usa
-- los compartidos.
create or replace function public.whatsapp_credenciales(
  p_phone_number_id text default null,
  p_org uuid default null
)
returns table (
  phone_number_id text,
  organizacion_id uuid,
  token text,
  app_secret text
)
language sql stable security definer set search_path = public as $$
  select
    n.phone_number_id,
    n.organizacion_id,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = n.token_secreto),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = n.app_secret_secreto)
  from public.whatsapp_numeros n
  where n.activo
    and (
      (p_phone_number_id is not null and n.phone_number_id = p_phone_number_id)
      or (p_org is not null and n.organizacion_id = p_org)
    );
$$;

-- Alta o cambio del número de una academia. Token y secreto opcionales
-- (null = los de la plataforma). Si se pasan, se guardan cifrados en Vault.
create or replace function public.guardar_whatsapp_numero(
  p_org uuid,
  p_phone_number_id text,
  p_numero_visible text default '',
  p_token text default null,
  p_app_secret text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  actual public.whatsapp_numeros;
  id_token uuid;
  id_app uuid;
begin
  select * into actual from public.whatsapp_numeros where organizacion_id = p_org;
  id_token := actual.token_secreto;
  id_app := actual.app_secret_secreto;

  if p_token is not null then
    if id_token is null then
      id_token := vault.create_secret(p_token, 'whatsapp_token_' || p_org);
    else
      perform vault.update_secret(id_token, p_token);
    end if;
  end if;
  if p_app_secret is not null then
    if id_app is null then
      id_app := vault.create_secret(p_app_secret, 'whatsapp_app_secret_' || p_org);
    else
      perform vault.update_secret(id_app, p_app_secret);
    end if;
  end if;

  delete from public.whatsapp_numeros where organizacion_id = p_org and phone_number_id <> p_phone_number_id;
  insert into public.whatsapp_numeros
    (phone_number_id, organizacion_id, numero_visible, token_secreto, app_secret_secreto)
  values (p_phone_number_id, p_org, coalesce(p_numero_visible, ''), id_token, id_app)
  on conflict (phone_number_id) do update set
    organizacion_id = excluded.organizacion_id,
    numero_visible = excluded.numero_visible,
    token_secreto = excluded.token_secreto,
    app_secret_secreto = excluded.app_secret_secreto,
    activo = true;
end;
$$;

revoke all on function public.whatsapp_credenciales(text, uuid) from public, anon, authenticated;
revoke all on function public.guardar_whatsapp_numero(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_credenciales(text, uuid) to service_role;
grant execute on function public.guardar_whatsapp_numero(uuid, text, text, text, text) to service_role;

-- Para dar de alta (o cambiar) el número de una academia:
--   en la cuenta de Meta de la plataforma:
--     select guardar_whatsapp_numero('<id de la organización>', '<phone_number_id>', '+54 9 ...');
--   con la cuenta de Meta de la academia (token y secreto de su app):
--     select guardar_whatsapp_numero('<id>', '<phone_number_id>', '+54 9 ...', '<token>', '<app secret>');

-- ============================================================
-- NUEVO (oct 2026): datos del negocio para la plantilla del bot
-- (multi-cliente, paso 4b).
--
-- El texto de instrucciones del bot de una academia nueva se arma con una
-- plantilla general y los datos de esta tabla. Faltaban tres que estaban
-- escritos a mano en el texto de anatomía: a dónde se transfiere, a nombre
-- de quién, y la dirección del portal de alumnos.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

alter table public.organizaciones add column if not exists alias_pago text not null default '';
alter table public.organizaciones add column if not exists titular_pago text not null default '';
alter table public.organizaciones add column if not exists url_portal text not null default '';

update public.organizaciones set
  alias_pago = 'academia.demo.mp',
  titular_pago = 'Laura Gómez',
  url_portal = 'https://academia-demo.vercel.app/'
where slug = 'academia-demo' and alias_pago = '';

-- ============================================================
-- NUEVO (oct 2026): dominios de cada academia (multi-cliente, paso 5a).
--
-- Las páginas públicas (landing, inscripción, portal del alumno, login)
-- saben de qué academia son por la dirección con la que entró la visita.
-- Una academia puede tener varios dominios: su .vercel.app, un subdominio
-- de la plataforma o uno propio. Se guardan en minúscula, sin "www." ni
-- puerto. Un dominio que no está acá muestra "no encontrado".
--
-- Para sumar un dominio: además de esta fila, hay que agregarlo al
-- proyecto en Vercel (Settings → Domains) y apuntar el DNS.
-- Solo lo usa el servidor (sin políticas).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.organizacion_dominios (
  dominio text primary key check (dominio = lower(dominio) and dominio !~ '^www\.' and dominio !~ ':'),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table public.organizacion_dominios enable row level security;
create index if not exists organizacion_dominios_org_idx on public.organizacion_dominios (organizacion_id);

insert into public.organizacion_dominios (dominio, organizacion_id)
select d.dominio, o.id
from public.organizaciones o,
  (values ('academia-demo.vercel.app'),
          ('academia-demo-preview.vercel.app')) as d(dominio)
where o.slug = 'academia-demo'
on conflict (dominio) do nothing;

-- ============================================================
-- NUEVO (oct 2026): administradores de la plataforma (multi-cliente).
--
-- Quien maneja la plataforma (no una academia): da de alta academias, les
-- conecta el dominio y el número de WhatsApp. Ve todas las academias, así
-- que NO alcanza con ser ADMIN de una: tiene que estar en esta tabla.
-- Se carga a mano. Solo lo usa el servidor (sin políticas).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table public.plataforma_admins enable row level security;

insert into public.plataforma_admins (user_id)
select id from public.profiles where email = 'admin@academia-demo.test'
on conflict (user_id) do nothing;

-- ============================================================
-- NUEVO (oct 2026): logos de las academias.
--
-- Depósito PÚBLICO de lectura: el logo se muestra en la web de cada
-- academia. Solo sube el servidor (service role), desde Panel → Plataforma.
-- Cada academia en su carpeta (<id de la organización>/logo-<fecha>.png).
-- SVG no, a propósito: puede llevar código adentro.
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ============================================================
-- NUEVO (oct 2026): cobro a las academias.
--
-- Cada academia tiene un plan: un abono mensual (en la moneda que se elija)
-- con el bot incluido hasta un tope de consumo en dólares (lo que cobra
-- Anthropic). Si se pasa del tope, el excedente se cobra a costo × factor,
-- en dólares. "Sin cargo" no genera resúmenes (Academia Demo).
--
-- cobros: un resumen por academia y por mes. Se cobra a mano (transferencia
-- o link de pago) y se marca como pagado desde Panel → Plataforma → Cobros.
-- Solo lo usa el servidor (sin políticas).
-- Pegá este bloque en Supabase → SQL Editor → Run (idempotente).
-- ============================================================

alter table public.organizaciones add column if not exists abono_monto numeric(12,2) not null default 0 check (abono_monto >= 0);
alter table public.organizaciones add column if not exists abono_moneda text not null default 'ARS' check (abono_moneda ~ '^[A-Z]{3}$');
alter table public.organizaciones add column if not exists bot_tope_usd numeric(10,2) not null default 10 check (bot_tope_usd >= 0);
alter table public.organizaciones add column if not exists excedente_factor numeric(6,2) not null default 2 check (excedente_factor >= 1);
alter table public.organizaciones add column if not exists sin_cargo boolean not null default false;

update public.organizaciones set sin_cargo = true where slug = 'academia-demo';

create table if not exists public.cobros (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  periodo text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  abono numeric(12,2) not null default 0,
  abono_moneda text not null default 'ARS',
  bot_costo_usd numeric(10,4) not null default 0,
  bot_tope_usd numeric(10,2) not null default 0,
  excedente_usd numeric(10,2) not null default 0,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'PAGADO')),
  pagado_en timestamptz,
  nota text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (organizacion_id, periodo)
);
alter table public.cobros enable row level security;
