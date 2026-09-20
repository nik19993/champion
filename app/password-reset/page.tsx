"use client";

import Image from "next/image";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type RecoveryState = "checking" | "ready" | "invalid" | "complete";

export default function PasswordResetPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRecoveryState("invalid");
      return;
    }

    const client = getSupabaseBrowserClient();
    let active = true;

    function applySession(session: Session | null) {
      if (!active) return;
      setRecoveryState(session ? "ready" : "invalid");
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        applySession(session);
      }
      if (event === "SIGNED_OUT") applySession(null);
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (active) setRecoveryState("invalid");
        return;
      }
      applySession(data.session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Пароль має містити щонайменше 12 символів.");
      return;
    }
    if (password !== confirmation) {
      setError("Паролі не збігаються.");
      return;
    }
    if (!isSupabaseConfigured || recoveryState !== "ready") {
      setError("Посилання вже недійсне. Запросіть нове посилання для відновлення.");
      return;
    }

    setBusy(true);
    const client = getSupabaseBrowserClient();
    const { error: updateError } = await client.auth.updateUser({ password });
    if (!updateError) {
      const { error: profileError } = await client.rpc("complete_password_change");
      if (profileError) {
        setBusy(false);
        setError("Пароль змінено, але профіль не оновлено. Увійдіть із новим паролем і повторіть дію.");
        return;
      }
    }
    setBusy(false);
    if (updateError) {
      setError("Не вдалося змінити пароль. Відкрийте свіже посилання з листа відновлення.");
      return;
    }
    setPassword("");
    setConfirmation("");
    setRecoveryState("complete");
  }

  if (recoveryState === "checking") {
    return <main className="loading-screen"><span className="loading-star" aria-hidden="true">★</span><p>Перевіряємо посилання відновлення…</p></main>;
  }

  if (recoveryState === "invalid") {
    return (
      <main className="auth-page">
        <section className="status-card">
          <span aria-hidden="true">✦</span>
          <h1>Посилання недійсне</h1>
          <p>Поверніться до входу та запросіть нове посилання для відновлення пароля.</p>
          <Link className="primary-button auth-primary-link" href="/">Повернутися до входу</Link>
        </section>
      </main>
    );
  }

  if (recoveryState === "complete") {
    return (
      <main className="auth-page">
        <section className="status-card">
          <span aria-hidden="true">✦</span>
          <h1>Пароль оновлено</h1>
          <p>Продовжіть вхід і налаштуйте додатковий захист облікового запису.</p>
          <Link className="primary-button auth-primary-link" href="/">Продовжити</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card compact" aria-labelledby="reset-title">
        <div className="auth-brand">
          <span className="brand-mark"><Image src="/champion-club-emblem.jpg" alt="" width={52} height={52} priority /></span>
          <div><strong>ЧЕМПІОН</strong><span>захищений робочий простір</span></div>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Відновлення доступу</p>
          <h1 id="reset-title">Новий пароль</h1>
          <p>Введіть новий пароль після переходу за посиланням із листа.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Новий пароль<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <label>Повторіть пароль<input type="password" minLength={12} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Оновлення…" : "Зберегти пароль"}</button>
          <Link className="text-link center" href="/">Повернутися до входу</Link>
        </form>
      </section>
    </main>
  );
}
