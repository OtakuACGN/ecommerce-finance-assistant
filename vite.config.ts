import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rolldownOptions: {
              input: 'electron/main.ts',
              external: ['electron'],
              output: {
                entryFileNames: '[name].cjs',
                format: 'cjs'
              }
            }
          }
        }
      },
      {
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rolldownOptions: {
              input: 'electron/preload.ts',
              output: {
                entryFileNames: '[name].cjs',
                format: 'cjs'
              }
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist'
  },
})
