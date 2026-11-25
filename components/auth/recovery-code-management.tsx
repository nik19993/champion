"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { LoadingState, Modal, StatusMessage } from "@/components/common/workspace-ui";
import { downloadText } from "@/lib/domain/format";
import { recoveryCodeError } from "@/lib/auth/recovery-codes";

export function RecoveryCodeManagement({ client }: { client: SupabaseClient }) {
  const [status, setStatus] = useState<{ total: number; remaining: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [replace, setReplace] = useState(false);

  const inspect = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await client.auth.mfa.recoveryCodes.getStatus();
      if (result.error && result.error.code !== "mfa_factor_not_found") throw result.error;
      setStatus(result.data ? { total: result.data.total, remaining: result.data.remaining } : null);
    } catch (caught) { setError(recoveryCodeError(caught)); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void inspect(); }, [inspect]);

  async function generate(regenerate: boolean) {
    if (busy) return;
    setBusy(true); setError(null); setReplace(false);
    try {
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new Error("MFA_REQUIRED");
      const result = regenerate
        ? await client.auth.mfa.recoveryCodes.regenerate()
        : await client.auth.mfa.recoveryCodes.generate({ friendlyName: "Резервні коди Чемпіон" });
      if (result.error || !result.data?.codes.length) throw result.error ?? new Error("NO_CODES");
      setCodes(result.data.codes);
      setStatus({ total: result.data.total, remaining: result.data.total });
      setSaved(false);
    } catch (caught) { setError(recoveryCodeError(caught)); }
    finally { setBusy(false); }
  }

  return <section className="panel-section">
    <h3>Резервні коди адміністратора</h3>
    <p>Використовуйте один код, якщо втрачено телефон із застосунком автентифікації. Спочатку потрібно ввійти за електронною адресою та паролем. Кожен код діє один раз і лише для вашого облікового запису.</p>
    {loading ? <LoadingState label="Перевіряємо резервні коди…" /> : <>
      {status ? <p>Невикористаних кодів: <strong>{status.remaining} із {status.total}</strong>.</p> : !error && <p>Ви ще не створили резервних кодів.</p>}
      {error && <StatusMessage kind="error">{error}</StatusMessage>}
      <div className="row-actions"><button className="primary-action" type="button" disabled={busy || Boolean(error)} onClick={() => status ? setReplace(true) : void generate(false)}>{busy ? "Створення…" : status ? "Створити нові коди" : "Створити резервні коди"}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void inspect()}>Перевірити стан</button></div>
    </>}
    <div className="text-block"><h3>Як відновити доступ</h3><p>Забули пароль — скористайтеся «Забули пароль?» на сторінці входу. Інший адміністратор також може встановити тимчасовий пароль у «Керування → Користувачі й паролі». Для двоетапного підтвердження потрібен застосунок автентифікації або ваш резервний код.</p><p>Якщо недоступні всі засоби підтвердження, зверніться до власника технічного проєкту для перевірки особи та відновлення доступу.</p></div>
    {replace && <Modal title="Замінити резервні коди?" onClose={() => setReplace(false)} footer={<><button className="secondary-action" type="button" onClick={() => setReplace(false)}>Скасувати</button><button className="primary-action" type="button" disabled={busy} onClick={() => void generate(true)}>Створити новий набір</button></>}><p>Усі невикористані коди з попереднього набору одразу припинять діяти. Новий набір потрібно зберегти.</p></Modal>}
    {codes && <Modal title="Збережіть резервні коди" onClose={() => setCodes(null)} footer={<button className="primary-action" type="button" disabled={!saved} onClick={() => setCodes(null)}>Готово</button>}>
      <p>Ці коди показано лише зараз. Збережіть їх у менеджері паролів або роздрукуйте та тримайте в безпечному місці окремо від телефона.</p>
      <pre className="recovery-code-list">{codes.map((code) => code.match(/.{1,4}/g)?.join("-") ?? code).join("\n")}</pre>
      <button className="secondary-action" type="button" onClick={() => downloadText("ЧЕМПІОН_резервні_коди.txt", "ЧЕМПІОН — персональні одноразові резервні коди\n\n" + codes.join("\n") + "\n\nНе передавайте ці коди іншим людям. Кожен код діє один раз.", "text/plain;charset=utf-8")}>Завантажити коди</button>
      <label className="check-field"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /><span>Я зберіг резервні коди в безпечному місці.</span></label>
    </Modal>}
  </section>;
}
