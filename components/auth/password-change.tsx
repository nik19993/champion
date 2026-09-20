"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";

export function PasswordChange({ client, onComplete }: { client: SupabaseClient; onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 12) return setError("Пароль має містити щонайменше 12 символів.");
    if (password !== repeat) return setError("Паролі не збігаються.");
    setBusy(true);
    const authResult = await client.auth.updateUser({ password });
    if (authResult.error) { setBusy(false); return setError("Не вдалося змінити пароль."); }
    const profileResult = await client.rpc("complete_password_change");
    setBusy(false);
    if (profileResult.error) return setError("Пароль змінено, але профіль не оновлено. Увійдіть ще раз.");
    onComplete();
  }

  return <main className="auth-page"><section className="auth-card compact"><div className="auth-copy"><p className="eyebrow">Перший вхід</p><h1>Створіть власний пароль</h1><p>Тимчасовий пароль більше не використовуватиметься.</p></div><form className="auth-form" onSubmit={submit}><label>Новий пароль<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label>Повторіть пароль<input type="password" minLength={12} autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} required /></label>{error && <p className="form-message error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Збереження…" : "Зберегти пароль"}</button></form></section></main>;
}
