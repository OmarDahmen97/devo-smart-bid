import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/candidates": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/cv": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/generation": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});