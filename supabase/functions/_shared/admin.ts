import { createClient } from "npm:@supabase/supabase-js@2.116.0";

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHORIZED");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) throw new Error("SERVER_CONFIG");
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await authClient.auth.getUser(token);
  if (userResult.error || !userResult.data.user) throw new Error("UNAUTHORIZED");
  const profileResult = await service.from("profiles").select("id, role, status").eq("id", userResult.data.user.id).single();
  if (profileResult.error || profileResult.data.role !== "admin" || profileResult.data.status !== "active") throw new Error("FORBIDDEN");
  const assurance = await authClient.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("MFA_REQUIRED");
  return { authenticated: authClient, service, adminId: userResult.data.user.id };
}
