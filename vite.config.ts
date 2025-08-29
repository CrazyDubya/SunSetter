import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/SunSetter/' : '/',
  server: {
    host: true,
    port: 3000
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    assetsDir: 'assets',
    copyPublicDir: false // We'll copy PWA files manually
  },
  publicDir: 'public'
})
