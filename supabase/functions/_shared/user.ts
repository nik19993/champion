import { createClient } from "npm:@supabase/supabase-js@2.116.0";

export async function requireActiveUser(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHORIZED");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) throw new Error("SERVER_CONFIG");
  const authenticated = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await authenticated.auth.getUser(token);
  if (userResult.error || !userResult.data.user) throw new Error("UNAUTHORIZED");
  const profileResult = await service.from("profiles").select("id, role, status").eq("id", userResult.data.user.id).single();
  if (profileResult.error || profileResult.data.status !== "active") throw new Error("FORBIDDEN");
  return { authenticated, service, userId: userResult.data.user.id, role: profileResult.data.role as "coach" | "admin" };
}
