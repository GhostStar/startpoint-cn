import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// dev: 5173, /api 代理到本地 8001 CN 服务
// build: 产物输出到 ../web/dist，由 cn-server 挂载在 /admin
export default defineConfig({
    plugins: [react()],
    base: "/admin/",
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:8001",
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: "../web/dist",
        emptyOutDir: true
    }
})
