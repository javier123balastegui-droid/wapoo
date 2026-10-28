import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Cuánto le dura al navegador lo que ya cargó de una pantalla.
     *
     * Todas las pantallas del panel se arman en el servidor en cada visita, y
     * eso siempre cuesta un viaje de ida y vuelta: medido, entre 400 y 700 ms
     * desde una computadora en Argentina, y bastante más desde un celular.
     * Hasta acá se bajó el trabajo del servidor todo lo que se podía, pero el
     * viaje no se puede evitar... salvo no hacerlo.
     *
     * Con esto, moverse entre secciones que ya se visitaron en los últimos 30
     * segundos sale del navegador, sin tocar el servidor: instantáneo. Es el
     * caso más común, que es ir y volver entre Agenda, Alumnos y Finanzas.
     *
     * Lo que se cambia desde la app se sigue viendo al instante: cada acción
     * que guarda algo llama a revalidatePath, y eso le limpia este caché. El
     * único caso de dato viejo es que OTRA persona cambie algo y uno vuelva a
     * esa pantalla dentro de los 30 segundos; a los 30 se vuelve a pedir sola.
     */
    staleTimes: {
      dynamic: 30,
    },
    /**
     * Lo más pesado que se manda por una acción es el logo de una academia
     * (hasta 2 MB, ver lib/plataforma.ts). El límite por defecto es 1 MB.
     */
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
