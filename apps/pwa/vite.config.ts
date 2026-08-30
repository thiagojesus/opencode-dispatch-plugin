import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import solidPlugin from "vite-plugin-solid"

const viteConfig = defineConfig({
  plugins: [
    solidPlugin(),
    VitePWA({
      devOptions: { enabled: false },
      manifest: {
        name: "OpenCode Dispatch",
        short_name: "Dispatch",
        description: "Continue explicitly enabled OpenCode sessions from a trusted device.",
        display: "standalone",
        start_url: "/",
        scope: "/",
        background_color: "oklch(95.5% 0.012 88)",
        theme_color: "oklch(20.5% 0.010 74)",
        icons: [
          { src: "/pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      registerType: "prompt",
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["index.html", "assets/**/*.{js,css}"],
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter(
              (entry) => entry.url === "index.html" || entry.url.startsWith("assets/"),
            ),
            warnings: [],
          }),
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//u],
        runtimeCaching: [
          {
            handler: "NetworkOnly",
            options: { fetchOptions: { cache: "no-store" } },
            urlPattern: /\/api\//u,
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 250,
    cssCodeSplit: true,
    reportCompressedSize: true,
    sourcemap: true,
    target: "es2022",
  },
})

// biome-ignore lint/style/noDefaultExport: Vite requires the configuration as a default export.
export default viteConfig
