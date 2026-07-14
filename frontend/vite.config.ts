import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, proxy API and WebSocket requests to the backend
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
      },
      "/health": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // 'hidden' in production: generates .map files for error tracking but does
    // not reference them in the bundle — source is not exposed to end users.
    sourcemap: process.env.NODE_ENV === "production" ? "hidden" : true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
