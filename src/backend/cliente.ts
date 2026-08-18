import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cliente: SupabaseClient | null | undefined

/** testes e build sem .env não falam com o banco */
export function bancoAtivo(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_ANON_KEY &&
      import.meta.env.MODE !== 'test',
  )
}

export function supabase(): SupabaseClient | null {
  if (!bancoAtivo()) return null
  if (cliente !== undefined) return cliente
  cliente = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return cliente
}
