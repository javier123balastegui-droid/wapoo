import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // El cliente admin de Supabase se saltea las reglas de acceso de la base: con
  // varias academias, una consulta sin filtro mezcla datos de todas. Para datos
  // de una academia se usa dbDeOrg (lib/supabase/org.ts). El cliente pelado
  // queda solo en estos archivos, cada uno con su motivo escrito ahí.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "lib/supabase/**",
      "app/actions/equipo.ts",
      "lib/organizacion.ts",
      "lib/portal-data.ts",
      "lib/bot/comprobantes.ts",
      "lib/bot/numeros.ts",
      "lib/plataforma.ts",
      "lib/plataforma-acceso.ts",
      "lib/cobros.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "supabase/admin$",
              message:
                "Usá dbDeOrg(orgId) de @/lib/supabase/org: el cliente admin pelado no filtra por organización.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
