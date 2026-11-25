export const GROUP_SUFFIX_VALUES = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

export function ageGroupCode(age: number, suffix: string): string | null {
  const letter = suffix.trim().toUpperCase();
  if (!Number.isInteger(age) || age < 6 || age > 17) return null;
  if (!/^[A-Z]?$/.test(letter) || (age >= 8 && !letter)) return null;
  return `U${age}${letter}`;
}

interface GroupIdentity {
  id: string;
  code: string;
  display_code?: string | null;
  age: number | null;
  display_age?: number | null;
  group_kind: string;
}

export function nextGroupSuffix(groups: GroupIdentity[], age: number): string {
  const codes = new Set(groups.flatMap((group) => [group.code, group.display_code ?? group.code]));
  return GROUP_SUFFIX_VALUES.find((suffix) => !codes.has(`U${age}${suffix}`)) ?? "A";
}

export function mergeCreatedGroup<T extends GroupIdentity>(groups: T[], created: T): T[] {
  return [...groups.filter((group) => group.id !== created.id), created].sort((a, b) =>
    a.group_kind.localeCompare(b.group_kind)
    || (a.display_age ?? a.age ?? 100) - (b.display_age ?? b.age ?? 100)
    || (a.display_code ?? a.code).localeCompare(b.display_code ?? b.code, "uk", { numeric: true }),
  );
}

export function groupCreationError(error: unknown): string {
  const details = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  const message = details.message ?? "";
  if (details.code === "23505" || message.includes("GROUP_ALREADY_EXISTS")) return "Група з такою назвою вже існує. Виберіть іншу літеру або категорію групи.";
  if (message.includes("MFA_REQUIRED") || details.code === "42501") return "Потрібна двоетапна перевірка адміністратора. Підтвердьте вхід і повторіть створення групи.";
  if (message.includes("INVALID_LOCATION_GROUP")) return "Перевірте номер локації та категорію групи: A, B, C або Junior.";
  if (message.includes("INVALID_GROUP")) return "Перевірте вік і літеру групи. Для U8–U17 потрібно вибрати латинську літеру A–Z.";
  if (message.includes("INITIAL_SEASON_REQUIRED")) return "Спочатку налаштуйте початковий сезон у розділі «Групи», а потім створіть нову групу.";
  return "Не вдалося створити групу. Перевірте з’єднання та повторіть спробу — повторне натискання не створить дубль.";
}
