import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React separado del resto
          'react-vendor': ['react', 'react-dom', 'react-hot-toast'],
          // Supabase + auth
          'supabase': ['@supabase/supabase-js'],
          // Iconos — usados por casi todos los módulos pero pesados
          'icons': ['lucide-react'],
          // PDF — solo se carga al exportar
          'pdf': ['jspdf', 'jspdf-autotable'],
          // Captura DOM — solo OrgChart la usa
          'html2canvas': ['html2canvas'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
