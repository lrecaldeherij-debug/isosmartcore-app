import { createClient } from '@supabase/supabase-js'

// Usamos variables de entorno para mayor seguridad
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan las variables de entorno de Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Debug: exponer el cliente supabase en window SOLO en dev/preview. En
// produccion no lo hacemos (finding #44 del audit) para no darle a un
// atacante XSS un handle facil de exfiltracion. En dev el acceso es util
// para inspeccionar sesion, setear user_metadata, testear queries, etc.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__supabase = supabase
}