import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    base: "/WMS_front/",
    plugins: [react()],
    server: {
        port: 5173
    }
});
