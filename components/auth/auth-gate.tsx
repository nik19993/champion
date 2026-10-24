"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoginForm } from "@/components/auth/login-form";
import { MfaGate } from "@/components/auth/mfa-gate";
import { PasswordChange } from "@/components/auth/password-change";
import type { Profile } from "@/lib/auth/types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type State =
  | { kind: "checking" }
  | { kind: "signed-out" }
  | { kind: "blocked"; message: string }
  | { kind: "ready"; session: Session; profile: Profile };

async function resolveProfile(client: SupabaseClient, session: Session): Promise<State> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, first_name, last_name, middle_name, email, role, status, must_change_password")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) return { kind: "blocked", message: "Не вдалося перевірити профіль. Спробуйте увійти ще раз." };
  if (!data) return { kind: "blocked", message: "Профіль ще не створено. Зверніться до адміністратора." };
  const profile = data as Profile;
  if (profile.status === "invited") return { kind: "blocked", message: "Доступ очікує активації адміністратором." };
  if (profile.status !== "active") return { kind: "blocked", message: "Доступ призупинено. Зверніться до адміністратора." };
  return { kind: "ready", session, profile };
}

export function AuthGate() {
  const [state, setState] = useState<State>(() => isSupabaseConfigured ? { kind: "checking" } : { kind: "signed-out" });
  const [mfaVerified, setMfaVerified] = useState(false);
  const [passwordChangedUserId, setPasswordChangedUserId] = useState<string | null>(null);
  const readyUserId = useRef<string | null>(null);
  const handleMfaVerified = useCallback(() => setMfaVerified(true), []);
  const handleMfaRequired = useCallback(() => setMfaVerified(false), []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("champion-shell-")).map((key) => window.caches.delete(key)));
      }
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabaseBrowserClient();
    let active = true;
    let resolution = 0;

    async function applySession(session: Session | null) {
      if (!active) return;
      const request = ++resolution;
      if (session && readyUserId.current === session.user.id) {
        setState((current) => current.kind === "ready" ? { ...current, session } : current);
        return;
      }
      setMfaVerified(false);
      setPasswordChangedUserId(null);
      readyUserId.current = null;
      if (!session) {
        setState({ kind: "signed-out" });
        return;
      }
      setState({ kind: "checking" });
      let next: State;
      try {
        next = await resolveProfile(client, session);
      } catch {
        next = { kind: "blocked", message: "Не вдалося перевірити профіль. Спробуйте увійти ще раз." };
      }
      if (active && request === resolution) {
        readyUserId.current = next.kind === "ready" ? next.profile.id : null;
        setState(next);
      }
    }

    const initialResolution = resolution;
    void client.auth.getSession().then(({ data }) => {
      if (active && resolution === initialResolution) return applySession(data.session);
    }).catch(() => {
      if (active && resolution === initialResolution) {
        setState({ kind: "blocked", message: "Не вдалося відновити сесію. Спробуйте увійти ще раз." });
      }
    });
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.replace("/password-reset/");
        return;
      }
      void applySession(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (state.kind === "checking") {
    return <main className="loading-screen"><span className="loading-star" aria-hidden="true">★</span><p>Перевіряємо захищений доступ…</p></main>;
  }
  if (state.kind === "signed-out") return <LoginForm />;
  if (state.kind === "blocked") {
    return (
      <main className="loading-screen">
        <section className="status-card"><span aria-hidden="true">✦</span><h1>Доступ недоступний</h1><p>{state.message}</p><button className="primary-button" onClick={() => void getSupabaseBrowserClient().auth.signOut()}>Повернутися до входу</button></section>
      </main>
    );
  }
  if (state.profile.role === "admin" && !mfaVerified) {
    return <MfaGate client={getSupabaseBrowserClient()} onVerified={handleMfaVerified} />;
  }
  if (state.profile.must_change_password && passwordChangedUserId !== state.profile.id) {
    return <PasswordChange client={getSupabaseBrowserClient()} onComplete={() => setPasswordChangedUserId(state.profile.id)} />;
  }
  return <AppShell client={getSupabaseBrowserClient()} profile={state.profile} onMfaRequired={handleMfaRequired} />;
}
