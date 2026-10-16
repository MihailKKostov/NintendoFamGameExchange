import { createClient } from 'npm:@supabase/supabase-js@2';
import { env } from './http.ts';

/** Returns true when the caller's JWT belongs to a current member of the group. */
export async function callerIsMember(req: Request): Promise<boolean> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return false;
  const client = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.rpc('is_member');
  return !error && data === true;
}
