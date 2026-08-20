import { createClient } from '@supabase/supabase-js'

// Usamos variables de entorno para mayor seguridad
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan las variables de entorno de Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Debug: exponer el cliente supabase en window para permitir setear/verificar
// user_metadata desde la consola de DevTools cuando algo del flujo no propaga
// correctamente. No es un riesgo de seguridad porque el cliente ya está en el
// bundle público — solo es acceso conveniente para operadores.
if (typeof window !== 'undefined') {
  window.__supabase = supabase
}