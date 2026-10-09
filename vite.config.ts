import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["three/addons/curves/NURBSCurve.js", "three/addons/loaders/STLLoader.js", "three/addons/loaders/OBJLoader.js", "three/addons/loaders/PLYLoader.js", "three/addons/loaders/GLTFLoader.js", "three/addons/loaders/MTLLoader.js", "three/addons/controls/OrbitControls.js", "dxf-parser"] },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/.qa-tools/**"] },
  },
  clearScreen: false,
  worker: { format: 'es' },
  build: {
    rollupOptions: { output: { manualChunks: { "pdf-core": ["pdfjs-dist"] } } },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/.qa-tools/**"],
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
