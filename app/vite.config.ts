import path from "path"
import fs from "fs"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function wappPagePlugin(): Plugin {
  const wappHtml = path.resolve(__dirname, "public/wapp/index.html")

  const serveWapp = (
    req: { url?: string },
    res: { setHeader: (k: string, v: string) => void; end: (body: string) => void },
    next: () => void,
  ) => {
    if (req.url !== "/wapp" && req.url !== "/wapp/") {
      next()
      return
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.end(fs.readFileSync(wappHtml, "utf8"))
  }

  return {
    name: "wapp-page",
    configureServer(server) {
      server.middlewares.use(serveWapp)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveWapp)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react(), wappPagePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
