import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  server:
    mode === "prod-api"
      ? {
          proxy: {
            "^/api(?:/|$)": {
              target: "https://redondeado-api.vercel.app",
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ""),
            },
          },
        }
      : {},
}));
