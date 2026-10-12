// Keep the editable value as text: clearing a minutes field must not insert zero.
export function durationInput(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  return /^\d*$/.test(text) ? text.replace(/^0+(?=\d)/, "") : text;
}

export function durationMinutes(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 15 && minutes <= 360 ? minutes : null;
}
