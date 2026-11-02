import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// NITRO_PRESET escolhe onde o app roda: "vercel" (padrão), "node-server" (Hostinger/VPS) ou "cloudflare-module".
export default defineConfig(({ command, mode }) => {
  const clientEnv = loadEnv(mode, process.cwd(), "VITE_");
  return {
    define: Object.fromEntries(Object.entries(clientEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    server: { port: 3000 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
        // Usa src/server.ts (tratamento de erros e tarefas em segundo plano) como entrada do servidor.
        server: { entry: "server" },
      }),
      ...(command === "build" ? [nitro({ preset: process.env["NITRO_PRESET"] || "vercel" })] : []),
      viteReact(),
    ],
  };
});
