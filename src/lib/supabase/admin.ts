import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Service-role client: bypasses RLS. Server-side ingestion only — never
// import from client components.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
