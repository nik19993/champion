// All records, users and Storage downloads are synthetic. No Supabase connection.
import { createRoot } from "react-dom/client";
import { AdminExport } from "../../components/admin/admin-export";
import { parseCsv } from "../../components/admin/import-management";
const group = { id: "group-demo", code: "U11A", cohort_birth_year: 2016, season: "2026/2027" };
const player = { id: "player-demo", group_id: group.id, full_name: "Коваль Марко Андрійович", birth_date: "2016-02-18", birth_year: 2016, position: "Півзахисник", dominant_foot: "Права", is_active: true, groups: group, coach_note: "Краще контролює м’яч під тиском. Активніше пропонує себе для передачі та взаємодіє з партнерами.", coach_note_author_name: "Демонстраційний тренер", coach_note_updated_at: "2026-09-25T10:00:00Z" };
const dates = ["2025-09-15", "2026-03-15", "2026-09-20"];
const db = {
  players: [player], guardians: [{ player_id: player.id, full_name: "Демонстраційний контакт", relation: "Мати", phone: "Не внесено", email: "" }],
  physical_test_results: dates.flatMap((date, i) => [
    { id: `${i}-a`, player_id: player.id, measured_on: date, metric_name: "Фламінго", field_name: "Втрати рівноваги", unit: "разів", value: ["6", "4", "3"][i] },
    { id: `${i}-b`, player_id: player.id, measured_on: date, metric_name: "Стрибок у довжину", field_name: "Краща спроба", unit: "см", value: ["145", "153", "159"][i] },
    { id: `${i}-c`, player_id: player.id, measured_on: date, metric_name: "Біг 20 м", field_name: "20 м", unit: "с", value: ["4,32", "4,18", "4,06"][i] },
    { id: `${i}-d`, player_id: player.id, measured_on: date, metric_name: "Тест 505", field_name: "Оббігання справа", unit: "с", value: ["3,07", "2,96", "2,89"][i] },
    ...(i === 1 ? [] : [{ id: `${i}-e`, player_id: player.id, measured_on: date, metric_name: "Тест 505", field_name: "Оббігання зліва", unit: "с", value: ["3,12", "", "2,92"][i] }]),
  ]),
  game_activity_results: dates.flatMap((period, i) => ["Лідерські якості", "Психоемоційна підготовленість", "Тактико-технічна підготовленість"].map((metric_name, j) => ({ id: `${i}-${j}`, player_id: player.id, period, metric_name, value: String(j === 1 ? [3, 3, 4][i] : [2, 3, 4][i]) }))),
  player_photos: [{ player_id: player.id, is_current: true, file_assets: { bucket: "player-photos", object_path: "synthetic-photo.png", scan_status: "clean" } }], export_jobs: [],
};
const qa = { db, mode: "normal", calls: [], text: [], canvases: [], images: [] };
window.profileQa = qa;
qa.parseActivity = (text) => parseCsv(text, "game_activity");
const createElement = document.createElement.bind(document);
document.createElement = (...args) => { const result = createElement(...args); if (args[0] === "canvas") qa.canvases.push(result); return result; };
const fillText = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function(value, x, y, ...args) { qa.text.push({ value, x, y, page: qa.canvases.indexOf(this.canvas), width: this.measureText(value).width }); return fillText.call(this, value, x, y, ...args); };
const drawImage = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) { qa.images.push({ src: image.src, coordinates: args }); return drawImage.call(this, image, ...args); };
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(key, value) { this.filters.push((row) => key.split(".").reduce((v, k) => (Array.isArray(v) ? v[0] : v)?.[k], row) === value); return this; }
  order() { return this; }
  range(from, to) { this.bounds = [from, to]; return this; }
  maybeSingle() { this.one = true; return this; }
  insert(payload) { this.payload = payload; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => {
    qa.calls.push({ table: this.table, bounds: this.bounds });
    if (qa.mode === "photo-query-error" && this.table === "player_photos") throw new Error("Synthetic photo query failure");
    if (qa.mode === "history-error" && this.table === "physical_test_results") return { data: null, error: { message: "Synthetic history failure" } };
    let rows = db[this.table].filter((row) => this.filters.every((f) => f(row)));
    if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
    if (this.payload) db[this.table].push(this.payload);
    if (this.one) return { data: rows[0] ?? null, error: null };
    return { data: structuredClone(rows), error: null };
  }).then(resolve, reject); }
}
const client = { from: (table) => new Query(table), storage: { from: (bucket) => ({ download: async (path) => {
  qa.calls.push({ bucket, path });
  if (qa.mode === "photo-error") return { data: null, error: { message: "Synthetic denied download" } };
  if (qa.mode === "bad-photo") return { data: new Blob(["Not an image"]), error: null };
  return { data: await (await fetch("/qa-portrait.png")).blob(), error: null };
} }) } };
createRoot(document.getElementById("root")).render(<AdminExport client={client} profile={{ id: "admin-demo", full_name: "Демонстраційний адміністратор", role: "admin" }} groups={[group]} />);
