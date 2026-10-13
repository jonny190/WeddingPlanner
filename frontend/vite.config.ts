import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately (uvicorn on :8000); in Docker nginx proxies /api.
// The end-to-end tests point the proxy at their own throwaway API.
// (Node's `process`, declared here so the browser code doesn't get Node types.)
declare const process: { env: Record<string, string | undefined> };
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  build: {
    // Small assets are normally inlined as data: URIs. Fonts never are: the content security
    // policy allows fonts from this origin only (font-src 'self'), and the tiny subset files
    // from @fontsource would otherwise be refused by the browser.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: { "/api": apiTarget },
  },
  preview: {
    proxy: { "/api": apiTarget },
  },
});
