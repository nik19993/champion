import { corsHeaders, json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";

interface Body {
  action: "create" | "reset_password" | "access" | "assign_groups" | "delete";
  user_id?: string;
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  role?: "coach" | "admin";
  enabled?: boolean;
  group_ids?: string[];
  confirmation_name?: string;
  reason?: string;
}

function passwordMeetsPolicy(password: string) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function createUserError(message: string | undefined) {
  if (!message) return "CREATE_FAILED";
  if (/already registered|already exists|email.*used/i.test(message)) return "EMAIL_EXISTS";
  if (/password|weak|character|symbol/i.test(message)) return "PASSWORD_POLICY";
  return "CREATE_FAILED";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { authenticated, service, adminId } = await requireAdmin(request);
    const body = await request.json() as Body;
    if (body.action === "create") {
      if (!body.email || !body.password || !body.first_name || !body.last_name || !body.role) return json({ error: "INVALID_INPUT" }, 400);
      if (!passwordMeetsPolicy(body.password)) return json({ error: "PASSWORD_POLICY" }, 400);
      const fullName = [body.last_name, body.first_name, body.middle_name].filter(Boolean).join(" ");
      const created = await service.auth.admin.createUser({ email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (created.error || !created.data.user) return json({ error: createUserError(created.error?.message) }, 400);
      const userId = created.data.user.id;
      const profile = await service.from("profiles").update({ full_name: fullName, last_name: body.last_name, first_name: body.first_name, middle_name: body.middle_name || null, email: body.email.trim().toLowerCase(), role: body.role, status: "active", must_change_password: true }).eq("id", userId);
      if (profile.error) {
        await service.auth.admin.deleteUser(userId);
        return json({ error: "PROFILE_UPDATE_FAILED" }, 400);
      }
      if (body.role === "coach" && body.group_ids?.length) {
        const assignment = await authenticated.rpc("admin_assign_groups", { p_coach_id: userId, p_group_ids: body.group_ids });
        if (assignment.error) {
          await service.auth.admin.deleteUser(userId);
          return json({ error: "GROUP_ASSIGNMENT_FAILED" }, 400);
        }
      }
      await service.from("audit_log").insert({ actor_id: adminId, action: "create_user", entity_type: "profiles", entity_id: userId, metadata: { role: body.role } });
      return json({ user_id: userId });
    }
    if (!body.user_id) return json({ error: "USER_REQUIRED" }, 400);
    if (body.action === "delete") {
      if (body.user_id === adminId) return json({ error: "CANNOT_DELETE_SELF" }, 400);
      if ((body.reason?.trim().length ?? 0) > 500) return json({ error: "INVALID_INPUT" }, 400);

      const targetResult = await service
        .from("profiles")
        .select("id, full_name, role, status")
        .eq("id", body.user_id)
        .single();
      if (targetResult.error || !targetResult.data) return json({ error: "USER_NOT_FOUND" }, 404);
      if (targetResult.data.role !== "coach") return json({ error: "ONLY_COACH_CAN_BE_DELETED" }, 400);
      if (targetResult.data.status === "closed") return json({ error: "USER_ALREADY_DELETED" }, 400);
      if (!body.confirmation_name || body.confirmation_name.trim() !== targetResult.data.full_name.trim()) {
        return json({ error: "CONFIRMATION_NAME_MISMATCH" }, 400);
      }

      let authIdentityMissing = false;
      const blockResult = await service.auth.admin.updateUserById(body.user_id, { ban_duration: "876000h" });
      if (blockResult.error) {
        if (/not found|does not exist/i.test(blockResult.error.message)) authIdentityMissing = true;
        else return json({ error: "AUTH_BLOCK_FAILED" }, 502);
      }

      const finalizeResult = await service.rpc("finalize_coach_deletion", {
        p_coach_id: body.user_id,
        p_admin_id: adminId,
        p_reason: body.reason?.trim() || null,
      });
      if (finalizeResult.error) {
        if (!authIdentityMissing) await service.auth.admin.updateUserById(body.user_id, { ban_duration: "none" });
        return json({ error: "DELETE_FINALIZATION_FAILED" }, 500);
      }

      if (!authIdentityMissing) {
        let deletionResult = await service.auth.admin.deleteUser(body.user_id, false);
        if (deletionResult.error) deletionResult = await service.auth.admin.deleteUser(body.user_id, false);
        if (deletionResult.error) {
          await service.from("audit_log").insert({
            actor_id: adminId,
            action: "delete_coach_auth_pending",
            entity_type: "profiles",
            entity_id: body.user_id,
            metadata: { account_blocked: true, historical_profile_retained: true },
          });
          return json({ error: "AUTH_DELETE_PENDING" }, 502);
        }
      }

      return json({ ok: true, ...((finalizeResult.data as Record<string, unknown> | null) ?? {}) });
    }
    if (body.action === "reset_password") {
      if (!body.password || !passwordMeetsPolicy(body.password)) return json({ error: "PASSWORD_POLICY" }, 400);
      const profile = await service.from("profiles").update({ must_change_password: true }).eq("id", body.user_id);
      if (profile.error) return json({ error: profile.error.message }, 400);
      const result = await service.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (result.error) return json({ error: result.error.message }, 400);
      await service.from("audit_log").insert({ actor_id: adminId, action: "reset_password", entity_type: "profiles", entity_id: body.user_id, metadata: {} });
      return json({ ok: true });
    }
    if (body.action === "access") {
      if (body.user_id === adminId && body.enabled === false) return json({ error: "CANNOT_DISABLE_SELF" }, 400);
      const status = body.enabled ? "active" : "suspended";
      const authResult = await service.auth.admin.updateUserById(body.user_id, { ban_duration: body.enabled ? "none" : "876000h" });
      if (authResult.error) return json({ error: authResult.error.message }, 400);
      const result = await service.from("profiles").update({ status }).eq("id", body.user_id);
      if (result.error) {
        await service.auth.admin.updateUserById(body.user_id, { ban_duration: body.enabled ? "876000h" : "none" });
        return json({ error: result.error.message }, 400);
      }
      await service.from("audit_log").insert({ actor_id: adminId, action: body.enabled ? "enable_access" : "disable_access", entity_type: "profiles", entity_id: body.user_id, metadata: {} });
      return json({ ok: true });
    }
    if (body.action === "assign_groups") {
      const assignment = await authenticated.rpc("admin_assign_groups", { p_coach_id: body.user_id, p_group_ids: body.group_ids ?? [] });
      if (assignment.error) return json({ error: assignment.error.message }, 400);
      await service.from("audit_log").insert({ actor_id: adminId, action: "assign_groups", entity_type: "profiles", entity_id: body.user_id, metadata: { group_count: body.group_ids?.length ?? 0 } });
      return json({ ok: true });
    }
    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVER_ERROR";
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "MFA_REQUIRED" ? 403 : 500;
    return json({ error: code }, status);
  }
});
