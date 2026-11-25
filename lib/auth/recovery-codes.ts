export function recoveryCodeError(error: unknown) {
  const details = error && typeof error === "object" ? error as { code?: string; status?: number } : {};
  if (details.code === "mfa_recovery_codes_locked" || details.status === 429) return "Забагато спроб. Зачекайте та повторіть перевірку або скористайтеся кодом із телефона.";
  if (details.status === 404 || details.code?.endsWith("_not_enabled")) return "Резервні коди ще не ввімкнено на сервері. Скористайтеся застосунком автентифікації або зверніться до відповідального за технічний доступ.";
  if (details.code === "mfa_recovery_codes_sole_factor") return "Спочатку налаштуйте та підтвердьте застосунок автентифікації.";
  return "Не вдалося виконати дію з резервними кодами. Перевірте код і з’єднання та повторіть спробу.";
}

export function normalizedRecoveryCode(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}
