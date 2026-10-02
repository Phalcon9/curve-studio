import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// The polyfill plugin injects this import into every file that uses Buffer,
// including workspace packages (packages/core) that can't resolve it themselves.
const bufferShim = fileURLToPath(new URL('./node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js', import.meta.url))

export default defineConfig({
    plugins: [react(), tailwindcss(), nodePolyfills({ include: ['buffer', 'crypto', 'stream', 'util'] })],
    resolve: { alias: { 'vite-plugin-node-polyfills/shims/buffer': bufferShim } },
})
