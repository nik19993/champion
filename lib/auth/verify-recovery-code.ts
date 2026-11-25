import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizedRecoveryCode } from "./recovery-codes.ts";

export async function verifyRecoveryCode(client: SupabaseClient, entered: string) {
  const code = normalizedRecoveryCode(entered);
  if (!/^[A-Z0-9]{12,64}$/.test(code)) throw new Error("INVALID_RECOVERY_CODE");
  const verified = await client.auth.mfa.recoveryCodes.verify({ code });
  if (verified.error) throw verified.error;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new Error("MFA_SESSION_REQUIRED");
}
