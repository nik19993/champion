"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sharedDevice, setSharedDevice] = useState(false);

  useEffect(() => {
    setSharedDevice(window.localStorage.getItem("champion:shared-device") === "true");
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!isSupabaseConfigured) {
      setError("Production-каркас готовий, але це середовище ще не підключене до Supabase.");
      return;
    }
    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { data: signInData, error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: normalizedEmail, password });
    setBusy(false);
    if (signInError || !signInData.session) {
      setError("Неправильна електронна адреса або пароль.");
      return;
    }
    setEmail(normalizedEmail);
    window.localStorage.setItem("champion:shared-device", String(sharedDevice));
  }

  async function resetPassword() {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Спочатку введіть електронну адресу.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError("Середовище ще не підключене до Supabase.");
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}/password-reset/`;
    const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    if (resetError) {
      setError("Не вдалося надіслати лист. Спробуйте ще раз або зверніться до адміністратора.");
      return;
    }
    setMessage("Якщо користувач існує, посилання для відновлення надіслано на вказану адресу.");
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-visual" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <Image className="hero-emblem" src="/champion-club-emblem.jpg" alt="Емблема футбольного клубу Чемпіон" width={200} height={200} priority />
          <p>Кожна дитина — зірка. Наше завдання — допомогти їй розкрити своє світло.</p>
        </div>
        <div className="auth-panel">
          <div className="auth-brand">
            <span className="brand-mark"><Image src="/champion-club-emblem.jpg" alt="" width={52} height={52} priority /></span>
            <div><strong>ЧЕМПІОН</strong><span>захищений робочий простір</span></div>
          </div>
          <div className="auth-copy">
            <p className="eyebrow">Вхід для команди школи</p>
            <h1 id="login-title">Раді бачити знову</h1>
            <p>Увійдіть за адресою та паролем, які надав адміністратор.</p>
          </div>
          <form className="auth-form" onSubmit={signIn}>
            <label>Електронна адреса<input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required /></label>
            <label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <label className="session-option"><input type="checkbox" checked={sharedDevice} onChange={(event) => setSharedDevice(event.target.checked)} /><span><b>Це спільний комп’ютер</b><small>{sharedDevice ? "Автоматичний вихід після 30 хвилин бездіяльності." : "На особистому пристрої вхід зберігатиметься до 8 годин бездіяльності."}</small></span></label>
            {error && <p className="form-message error" role="alert">{error}</p>}
            {message && <p className="form-message success" role="status">{message}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Вхід…" : "Увійти"}</button>
            <button className="text-button" type="button" onClick={resetPassword} disabled={busy}>Забули пароль?</button>
          </form>
          <p className="privacy-note">Тренер входить лише за логіном і паролем. Двоетапне підтвердження застосовується тільки до адміністратора.</p>
        </div>
      </section>
    </main>
  );
}
