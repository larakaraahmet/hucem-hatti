import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // API isteklerini FastAPI'ye yönlendir (CORS ayarı gerekmez)
    proxy: {
      "/player":   "http://localhost:8000",
      "/players":  "http://localhost:8000",
      "/teams":    "http://localhost:8000",
      "/stats":    "http://localhost:8000",
      "/fixtures": "http://localhost:8000",
      "/matches":  "http://localhost:8000",
      "/h2h":      "http://localhost:8000",
      "/auth":     "http://localhost:8000",
    },
  },
});
