import path from "path"
import fs from "fs"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function orderPagePlugin(): Plugin {
  const orderHtml = path.resolve(__dirname, "public/order/index.html")

  const serveOrder = (
    req: { url?: string },
    res: { setHeader: (k: string, v: string) => void; end: (body: string) => void },
    next: () => void,
  ) => {
    if (req.url !== "/order" && req.url !== "/order/") {
      next()
      return
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.end(fs.readFileSync(orderHtml, "utf8"))
  }

  return {
    name: "order-page",
    configureServer(server) {
      server.middlewares.use(serveOrder)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveOrder)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react(), orderPagePlugin()],
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
