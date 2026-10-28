import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// En Next.js 16 el antiguo "middleware" se llama "proxy".
//
// Acá se refresca la sesión de Supabase, como recomienda Supabase SSR. El
// detalle importante es CUÁNDO: `getUser()` no lee la cookie y listo, sino que
// llama por red al servidor de autenticación para validar el token. Esto corre
// antes de que Next empiece a responder, así que ese viaje se le suma a todo
// lo que pase por acá.
//
// Y pasaba por acá absolutamente todo: cada clic, cada precarga que hace Next
// al pasar el mouse por un enlace, cada llamada a la API. Por eso el panel
// tardaba en reaccionar al tocar una sección.
//
// Ahora se saltea en tres casos donde no hace falta. En todos ellos la sesión
// se sigue refrescando igual en la próxima navegación de verdad, que es lo
// único que necesita la cookie al día.

/** Endpoints que nunca los llama un navegador con sesión. */
const SIN_SESION = ["/api/cron/", "/api/whatsapp", "/api/diagnostico"];

/** ¿Hay siquiera una sesión que refrescar? */
function tieneSesion(request: NextRequest): boolean {
  // Supabase guarda la sesión en cookies que arrancan con "sb-".
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // 1. Visitante sin sesión: no hay token que validar. Cubre la web pública y
  //    todo el portal de alumnos, que entra con código y no con cuenta.
  if (!tieneSesion(request)) return response;

  // 2. Precarga de Next: es la que dispara el router al anticipar un clic. No
  //    necesita la cookie al día y, si se la hace esperar, el clic se siente
  //    lento justamente por adelantarse.
  if (request.headers.get("next-router-prefetch") === "1") return response;

  // 3. Endpoints de máquina a máquina: no hay navegador ni sesión del otro
  //    lado. El webhook de WhatsApp entra con su token de verificación y los
  //    cron y el diagnóstico con CRON_SECRET; adentro todo usa el cliente
  //    admin. Ojo: /api/bot NO entra acá, porque ese sí exige sesión iniciada
  //    (lo usa la pantalla de prueba del equipo) y sin refresco daría un 401
  //    cuando el token está por vencer.
  if (SIN_SESION.some((ruta) => request.nextUrl.pathname.startsWith(ruta))) {
    return response;
  }

  return refrescarSesion(request);
}

/** Mantiene la sesión al día y reescribe las cookies si rotaron. */
async function refrescarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getSession() y no getUser(): acá lo único que hace falta es mantener la
  // cookie al día. getSession() lee el token de la cookie y sale a la red SOLO
  // si está vencido, mientras que getUser() llama al servidor de
  // autenticación en cada request, aunque el token esté fresco.
  //
  // Esto no relaja la seguridad: el proxy no decide quién entra a dónde. Eso
  // lo hace cada pantalla con getCurrentUser() (lib/auth.ts), que sí usa
  // getUser() y valida el token contra Supabase. La advertencia de Supabase
  // sobre no confiar en getSession() aplica a quien autoriza con eso, y acá no
  // se autoriza nada.
  await supabase.auth.getSession();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
