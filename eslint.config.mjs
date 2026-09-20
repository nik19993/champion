import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Remote Supabase data is intentionally loaded from effects. The rule treats
      // the loading-state update at the start of an async loader as synchronous.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "supabase/functions/**"]),
]);
