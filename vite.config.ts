import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'tidy-dev-csp',
      apply: 'serve',
      // React Refresh injects an inline preamble and Vite uses a WebSocket.
      transformIndexHtml: html => html.replace(
        "script-src 'self';",
        "script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:;",
      ),
    },
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: { build: { emptyOutDir: true } },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              }
            }
          }
        }
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'bufferutil': path.resolve(__dirname, './electron/lib/emptyStub.cjs'),
      'utf-8-validate': path.resolve(__dirname, './electron/lib/emptyStub.cjs'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
