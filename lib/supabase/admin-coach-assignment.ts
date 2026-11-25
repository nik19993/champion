import type { SupabaseClient } from "@supabase/supabase-js";

export class AssignmentRequestError extends Error {
  readonly code: "UNAUTHORIZED" | "MFA_REQUIRED" | "ASSIGNMENT_TIMEOUT" | "ASSIGNMENT_STATUS_UNKNOWN" | "ASSIGNMENT_CANCELLED";
  constructor(code: AssignmentRequestError["code"]) {
    super(code);
    this.code = code;
  }
}

async function bounded<T>(work: (signal: AbortSignal) => PromiseLike<T>, milliseconds: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new AssignmentRequestError("ASSIGNMENT_TIMEOUT")); controller.abort(); }, milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/** A goal-state RPC is safe to retry; never turn a lost response into a false success. */
export async function saveCoachAssignment(
  client: SupabaseClient,
  coachId: string,
  groupId: string,
  assigned: boolean,
  options: { timeoutMs?: number; verifyTimeoutMs?: number } = {},
) {
  let submitted = false;
  let actorId: string | undefined;
  try {
    await bounded(async (signal) => {
      // getSession refreshes an expiring token itself. Forcing a refresh for each
      // checkbox adds needless requests and contention with the other browser tabs.
      const session = await client.auth.getSession();
      if (signal.aborted) throw new AssignmentRequestError("ASSIGNMENT_CANCELLED");
      if (session.error || !session.data.session) throw new AssignmentRequestError("UNAUTHORIZED");
      actorId = session.data.session.user.id;
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (signal.aborted) throw new AssignmentRequestError("ASSIGNMENT_CANCELLED");
      if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new AssignmentRequestError("MFA_REQUIRED");
      submitted = true;
      const result = await client.rpc("admin_set_coach_group", {
        p_coach_id: coachId, p_group_id: groupId, p_assigned: assigned,
      }).abortSignal(signal);
      if (result.error) throw result.error;
    }, options.timeoutMs ?? 15000);
    return { confirmedAfterRetry: false };
  } catch (error) {
    const details = error as { code?: string; message?: string };
    const uncertain = submitted && (error instanceof AssignmentRequestError || !details.code || ["", "57014"].includes(details.code));
    if (!uncertain) throw error;
    // A timed-out request may already have committed. A separate bounded read
    // confirms the desired state without submitting the write a second time.
    try {
      const confirmed = await bounded(async (signal) => {
        const actor = await client.from("profiles").select("role,status").eq("id", actorId).abortSignal(signal).single();
        if (actor.error || actor.data?.role !== "admin" || actor.data?.status !== "active") throw new AssignmentRequestError("UNAUTHORIZED");
        const result = await client.from("coach_group_assignments").select("is_active")
          .eq("coach_id", coachId).eq("group_id", groupId).abortSignal(signal).maybeSingle();
        if (result.error) throw result.error;
        return (result.data?.is_active ?? false) === assigned;
      }, options.verifyTimeoutMs ?? 5000);
      if (confirmed) return { confirmedAfterRetry: true };
    } catch { /* Keep the uncertainty visible instead of claiming the write failed. */ }
    throw new AssignmentRequestError("ASSIGNMENT_STATUS_UNKNOWN");
  }
}

export async function loadCoachUsers(client: SupabaseClient, timeoutMs = 15000) {
  return bounded(async (signal) => {
    const result = await client.from("profiles").select("id, full_name, first_name, last_name, middle_name, email, role, status, must_change_password, coach_group_assignments!coach_group_assignments_coach_id_fkey(group_id, is_active)")
      .neq("status", "closed").order("full_name").abortSignal(signal);
    if (result.error) throw result.error;
    return result.data ?? [];
  }, timeoutMs);
}
