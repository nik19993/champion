"use client";

import Image from "next/image";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Mode = "checking" | "offer-enrollment" | "enrollment" | "challenge";

interface Props {
  client: SupabaseClient;
  onVerified: () => void;
}

export function MfaGate({ client, onVerified }: Props) {
  const [mode, setMode] = useState<Mode>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspect = useCallback(async () => {
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.data?.currentLevel === "aal2") {
      onVerified();
      return;
    }
    const factors = await client.auth.mfa.listFactors();
    const verified = factors.data?.totp.find((factor) => factor.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setMode("challenge");
    } else {
      setMode("offer-enrollment");
    }
  }, [client, onVerified]);

  useEffect(() => {
    const timer = window.setTimeout(() => void inspect(), 0);
    return () => window.clearTimeout(timer);
  }, [inspect]);

  async function enroll() {
    setBusy(true);
    setError(null);
    const { data, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "ЧЕМПІОН" });
    setBusy(false);
    if (enrollError || !data) {
      setError("Не вдалося почати налаштування. Спробуйте ще раз.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setMode("enrollment");
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || code.trim().length !== 6) {
      setError("Введіть шестизначний код із застосунку автентифікації.");
      return;
    }
    setBusy(true);
    setError(null);
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      setError("Не вдалося створити перевірку. Спробуйте ще раз.");
      return;
    }
    const result = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
    if (result.error) {
      setBusy(false);
      setError("Код не підтверджено. Перевірте його та спробуйте ще раз.");
      return;
    }
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(false);
    if (assurance.error || assurance.data?.currentLevel !== "aal2") {
      setError("Захищену сесію ще не оновлено. Введіть новий код і повторіть перевірку.");
      return;
    }
    onVerified();
  }

  return (
    <main className="auth-page">
      <section className="auth-card compact" aria-labelledby="mfa-title">
        <div className="auth-brand">
          <span className="brand-mark"><Image src="/champion-club-emblem.jpg" alt="" width={52} height={52} priority /></span>
          <div><strong>ЧЕМПІОН</strong><span>захищений робочий простір</span></div>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Захист адміністратора</p>
          <h1 id="mfa-title">Двоетапна перевірка</h1>
          <p>Адміністративні дані відкриваються лише після підтвердження одноразовим кодом.</p>
        </div>
        {mode === "checking" && <p className="form-message">Перевіряємо налаштування…</p>}
        {mode === "offer-enrollment" && <button className="primary-button" type="button" onClick={enroll} disabled={busy}>{busy ? "Підготовка…" : "Налаштувати захист"}</button>}
        {mode === "enrollment" && qrCode && (
          <div className="mfa-setup">
            <Image className="qr-code" src={qrCode} alt="QR-код для застосунку автентифікації" width={210} height={210} unoptimized />
            <p>Відскануйте QR-код у застосунку автентифікації. Резервний ключ: <code>{secret}</code></p>
          </div>
        )}
        {(mode === "challenge" || mode === "enrollment") && (
          <form className="auth-form" onSubmit={verify}>
            <label>Одноразовий код<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required /></label>
            {error && <p className="form-message error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Перевірка…" : "Підтвердити"}</button>
          </form>
        )}
        {error && mode === "offer-enrollment" && <p className="form-message error" role="alert">{error}</p>}
        <button className="text-button" type="button" onClick={() => void client.auth.signOut()}>Вийти</button>
      </section>
    </main>
  );
}
