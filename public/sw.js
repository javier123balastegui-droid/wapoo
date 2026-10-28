// Service worker mínimo: habilita que la app sea "instalable" como PWA.
// No cachea nada por ahora (deja pasar las peticiones normalmente), así siempre
// se ve la versión más reciente. Más adelante se puede sumar caché offline.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", () => {
  // Sin intervención: el navegador resuelve la petición como siempre.
});

// ── Notificaciones push ──────────────────────────────────────
// Llega un push del servidor (lib/push.ts) → mostramos la notificación.
// El payload es JSON: { titulo, cuerpo, url }. Si viniera vacío o roto,
// mostramos un aviso genérico igual: es preferible avisar de más que perder
// la notificación.
self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = {};
  }

  const titulo = datos.titulo || "Academia Demo";
  const opciones = {
    body: datos.cuerpo || "Tenés una novedad en la plataforma.",
    // icon = ícono GRANDE a color (logo con fondo crema, se ve en cualquier tema).
    icon: "/icon-maskable.png",
    // badge = ícono CHICO de la barra de estado: Android solo usa la silueta
    // (canal alfa) y la pinta de blanco, por eso va el PNG con fondo transparente.
    badge: "/icon-any.png",
    lang: "es",
    // Al tocarla, notificationclick abre esta ruta.
    data: { url: datos.url || "/panel" },
    // Sin tag: cada aviso es uno nuevo y no se pisan entre sí.
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

// Al tocar la notificación: si la app ya está abierta en una pestaña, la
// enfocamos y la llevamos a la ruta; si no, abrimos una ventana nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/panel";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((ventanas) => {
        for (const v of ventanas) {
          if ("focus" in v) {
            if ("navigate" in v) v.navigate(destino).catch(() => {});
            return v.focus();
          }
        }
        return self.clients.openWindow(destino);
      }),
  );
});
