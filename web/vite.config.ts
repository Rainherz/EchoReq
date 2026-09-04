import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = process.env.ECHOREQ_API ?? "http://localhost:8010";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // El backend se sirve bajo el mismo origen: la interfaz no necesita CORS
    // ni conocer el puerto de la API.
    proxy: {
      "/api": { target: API, changeOrigin: true },
    },
  },
});
