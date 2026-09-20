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
  const [passwordChanged, setPasswordChanged] = useState(false);
  const readyUserId = useRef<string | null>(null);
  const handleMfaVerified = useCallback(() => setMfaVerified(true), []);
  const handleMfaRequired = useCallback(() => setMfaVerified(false), []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const wasControlled = navigator.serviceWorker.controller !== null;
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("champion-shell-")).map((key) => window.caches.delete(key)));
      }
      const reloadKey = "champion:service-worker-cleanup:v1";
      if (active && wasControlled && !window.sessionStorage.getItem(reloadKey)) {
        window.sessionStorage.setItem(reloadKey, "done");
        window.location.reload();
      }
    })().catch(() => undefined);

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabaseBrowserClient();
    let active = true;

    async function applySession(session: Session | null) {
      if (!active) return;
      if (session && readyUserId.current === session.user.id) {
        setState((current) => current.kind === "ready" ? { ...current, session } : current);
        return;
      }
      setMfaVerified(false);
      if (!session) {
        readyUserId.current = null;
        setState({ kind: "signed-out" });
        return;
      }
      setState({ kind: "checking" });
      const next = await resolveProfile(client, session);
      if (active) {
        readyUserId.current = next.kind === "ready" ? next.profile.id : null;
        setState(next);
      }
    }

    void client.auth.getSession().then(({ data }) => applySession(data.session));
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
  if (state.profile.must_change_password && !passwordChanged) {
    return <PasswordChange client={getSupabaseBrowserClient()} onComplete={() => setPasswordChanged(true)} />;
  }
  return <AppShell client={getSupabaseBrowserClient()} profile={state.profile} onMfaRequired={handleMfaRequired} />;
}
