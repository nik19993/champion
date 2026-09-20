import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260917154528_foundation_0_2_2.sql", import.meta.url);
const modulesMigrationUrls = [
  "20260917154737_working_modules_schema_0_2_2.sql",
  "20260917154826_working_access_helpers_0_2_2.sql",
  "20260917154843_working_business_triggers_0_2_2.sql",
  "20260917154917_working_file_validation_trigger_0_2_2.sql",
  "20260917154932_working_audit_helper_0_2_2.sql",
  "20260917155511_working_file_read_helper_0_2_2_hotfix.sql",
  "20260917155528_working_storage_read_helper_0_2_2.sql",
  "20260917155555_working_atomic_workflows_0_2_2.sql",
  "20260917155612_working_admin_workflows_0_2_2.sql",
  "20260917155631_working_function_grants_triggers_0_2_2.sql",
  "20260917155702_working_rls_policies_0_2_2.sql",
  "20260917155725_working_data_api_grants_0_2_2.sql",
  "20260917155740_working_private_storage_0_2_2.sql",
  "20260917160515_payment_audit_actor_hotfix.sql",
  "20260917161057_file_access_helper_grant_hotfix.sql",
].map((name) => new URL(`../supabase/migrations/${name}`, import.meta.url));
const goalkeeperMigrationUrl = new URL("../supabase/migrations/20260917155756_goalkeeper_groups_0_2_2.sql", import.meta.url);
const hardeningMigrationUrl = new URL("../supabase/migrations/20260917161812_staging_security_hardening.sql", import.meta.url);
const seedUrl = new URL("../supabase/seed.sql", import.meta.url);
const supabaseConfigUrl = new URL("../supabase/config.toml", import.meta.url);
const appShellUrl = new URL("../components/layout/app-shell.tsx", import.meta.url);
const coachPlanUrl = new URL("../components/coach/coach-plan.tsx", import.meta.url);
const coachPlayersUrl = new URL("../components/coach/coach-players.tsx", import.meta.url);
const coachMethodologyUrl = new URL("../components/coach/coach-methodology.tsx", import.meta.url);
const coachInventoryUrl = new URL("../components/coach/coach-inventory.tsx", import.meta.url);
const managementUrl = new URL("../components/admin/admin-management.tsx", import.meta.url);
const workspaceUiUrl = new URL("../components/common/workspace-ui.tsx", import.meta.url);
const adminPlanUrl = new URL("../components/admin/admin-plan.tsx", import.meta.url);
const adminGroupsUrl = new URL("../components/admin/admin-groups.tsx", import.meta.url);
const adminUniformUrl = new URL("../components/admin/admin-uniform.tsx", import.meta.url);
const adminInventoryUrl = new URL("../components/admin/inventory-management.tsx", import.meta.url);
const programManagementUrl = new URL("../components/admin/program-management.tsx", import.meta.url);
const structureManagementUrl = new URL("../components/admin/structure-management.tsx", import.meta.url);
const importManagementUrl = new URL("../components/admin/import-management.tsx", import.meta.url);
const adminExportUrl = new URL("../components/admin/admin-export.tsx", import.meta.url);
const domainFormatUrl = new URL("../lib/domain/format.ts", import.meta.url);
const fileUploadUrl = new URL("../lib/supabase/files.ts", import.meta.url);
const fileValidationUrl = new URL("../supabase/functions/file-validate/index.ts", import.meta.url);
const attendanceQueueUrl = new URL("../lib/offline/attendance-queue.ts", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const importPreviewUrl = new URL("../supabase/functions/import-preview/index.ts", import.meta.url);
const evaluationMigrationUrl = new URL("../supabase/migrations/20260918121638_evaluation_metric_catalogs.sql", import.meta.url);
const evaluationAgeBandsMigrationUrl = new URL("../supabase/migrations/20260919173000_evaluation_metric_age_bands.sql", import.meta.url);
const physicalComponentsMigrationUrl = new URL("../supabase/migrations/20260920090000_physical_test_components.sql", import.meta.url);
const importGroupScopeMigrationUrl = new URL("../supabase/migrations/20260919083847_import_results_group_scope.sql", import.meta.url);
const libraryMigrationUrl = new URL("../supabase/migrations/20260919140000_goalkeeper_announcements_methodology_library.sql", import.meta.url);
const evaluationManagementUrl = new URL("../components/admin/evaluation-management.tsx", import.meta.url);
const adminMethodologyManagementUrl = new URL("../components/admin/admin-management-methodology.tsx", import.meta.url);
const sessionTimeoutUrl = new URL("../components/auth/session-timeout-guard.tsx", import.meta.url);
const methodologySeedUrl = new URL("../supabase/seed/20260918_methodology_content.sql", import.meta.url);
const passwordResetUrl = new URL("../app/password-reset/page.tsx", import.meta.url);
const authGateUrl = new URL("../components/auth/auth-gate.tsx", import.meta.url);
const loginFormUrl = new URL("../components/auth/login-form.tsx", import.meta.url);
const mfaGateUrl = new URL("../components/auth/mfa-gate.tsx", import.meta.url);
const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
const serviceWorkerUrl = new URL("../public/sw.js", import.meta.url);
const stagingFixtureUrl = new URL("../supabase/staging/20260918_safe_test_fixture_0_2_7.sql", import.meta.url);
const stagingFixtureCleanupUrl = new URL("../supabase/staging/cleanup_safe_test_fixture_0_2_7.sql", import.meta.url);
const playerImportTemplateUrl = new URL("../public/templates/champion-import-players.xlsx", import.meta.url);
const physicalImportTemplateUrl = new URL("../public/templates/champion-import-physical-tests.xlsx", import.meta.url);
const gameActivityImportTemplateUrl = new URL("../public/templates/champion-import-game-activity.xlsx", import.meta.url);
const universalExcelTemplateUrl = new URL("../public/templates/champion-import-template.xlsx", import.meta.url);
const universalWordTemplateUrl = new URL("../public/templates/champion-import-template.docx", import.meta.url);
const adminFunctionAuthUrl = new URL("../supabase/functions/_shared/admin.ts", import.meta.url);
const adminUsersFunctionUrl = new URL("../supabase/functions/admin-users/index.ts", import.meta.url);
const conflictCleanupMigrationUrl = new URL("../supabase/migrations/20260920085722_cleanup_transient_schedule_conflicts.sql", import.meta.url);

async function readModulesMigration() {
  return (await Promise.all(modulesMigrationUrls.map((url) => readFile(url, "utf8")))).join("\n");
}

test("payment status has exactly two agreed values", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const match = sql.match(/create type public\.payment_status as enum \(([^)]+)\)/i);
  assert.ok(match, "payment_status enum must exist");
  const values = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
  assert.deepEqual(values, ["paid", "unpaid"]);
});

test("group seed contains all age teams and three goalkeeper groups", async () => {
  const sql = await readFile(seedUrl, "utf8");
  const codes = [...sql.matchAll(/\('(U\d{1,2}[AB]?)'/g)].map((item) => item[1]);
  const expected = ["U6", "U7"];
  for (let age = 8; age <= 15; age += 1) expected.push(`U${age}A`, `U${age}B`);
  assert.deepEqual(codes, expected);
  const goalkeeperCodes = [...sql.matchAll(/\('(Воротарі [ABC])',\s*null,\s*'[ABC]',\s*'goalkeeper'/g)].map((item) => item[1]);
  assert.deepEqual(goalkeeperCodes, ["Воротарі A", "Воротарі B", "Воротарі C"]);
});

test("goalkeeper groups remain assignable without a false age", async () => {
  const [sql, shell, management, plan] = await Promise.all([
    readFile(goalkeeperMigrationUrl, "utf8"),
    readFile(appShellUrl, "utf8"),
    readFile(managementUrl, "utf8"),
    readFile(coachPlanUrl, "utf8"),
  ]);
  assert.match(sql, /group_kind text not null default 'age'/i);
  assert.match(sql, /group_kind = 'goalkeeper'[\s\S]*age is null/i);
  assert.match(sql, /create or replace function public\.attach_event_material/i);
  assert.match(shell, /group_kind/);
  assert.match(management, /Воротарські групи/);
  assert.match(plan, /Завдання заняття/);
  assert.doesNotMatch(plan, /Тема воротарського заняття/);
});

test("every foundation table enables row-level security", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["profiles", "groups", "coach_group_assignments", "audit_log"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("administrator authorization requires aal2", async () => {
  const [sql, edgeAuth] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(adminFunctionAuthUrl, "utf8"),
  ]);
  assert.match(sql, /auth\.jwt\(\) ->> 'aal'\), 'aal1'\) = 'aal2'/i);
  assert.match(edgeAuth, /getAuthenticatorAssuranceLevel\(token\)/);
});

test("local and declarative Auth defaults are staff-only", async () => {
  const config = await readFile(supabaseConfigUrl, "utf8");
  assert.match(config, /enable_signup = false/);
  assert.match(config, /enable_anonymous_sign_ins = false/);
  assert.match(config, /minimum_password_length = 12/);
  assert.match(config, /password_requirements = "lower_upper_letters_digits_symbols"/);
});

test("password recovery waits for a session and completes the profile workflow", async () => {
  const [resetPage, authGate] = await Promise.all([
    readFile(passwordResetUrl, "utf8"),
    readFile(authGateUrl, "utf8"),
  ]);
  assert.match(resetPage, /auth\.getSession\(\)/);
  assert.match(resetPage, /event === "PASSWORD_RECOVERY"/);
  assert.match(resetPage, /rpc\("complete_password_change"\)/);
  assert.match(resetPage, /minLength=\{12\}/);
  assert.match(authGate, /event === "PASSWORD_RECOVERY"[\s\S]{0,160}window\.location\.replace\("\/password-reset\/"\)/);
});

test("all storage buckets are private", async () => {
  const sql = `${await readFile(migrationUrl, "utf8")}\n${await readModulesMigration()}`;
  for (const bucket of ["methodology", "task-documents", "player-photos", "imports", "exports"]) {
    assert.match(sql, new RegExp(`\\('${bucket}', '${bucket}', false`, "i"));
  }
});

test("working module tables enable row-level security", async () => {
  const sql = await readModulesMigration();
  for (const table of ["players", "monthly_payments", "events", "attendance_sessions", "methodology_tasks", "inventory_items", "announcements", "import_jobs", "export_jobs"]) {
    assert.match(sql, new RegExp(`['\"]${table}['\"]`, "i"), `${table} must be in the RLS table list`);
  }
  assert.match(sql, /alter table public\.%I enable row level security/i);
});

test("coach navigation keeps the agreed order", async () => {
  const source = await readFile(appShellUrl, "utf8");
  const plan = source.indexOf('value: "plan", label: "План"');
  const players = source.indexOf('value: "players", label: "Гравці"');
  const methodology = source.indexOf('value: "methodology", label: "Методика"');
  const inventory = source.indexOf('value: "inventory", label: "Інвентар"');
  assert.ok(plan >= 0 && plan < players && players < methodology && methodology < inventory);
});

test("calendar supports large add target and real create-similar action", async () => {
  const [source, styles] = await Promise.all([readFile(coachPlanUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /onClick=\{\(\) => onCreateSimilar\(event\)\}/);
  assert.match(source, /Створити подібне/);
  assert.match(styles, /\.calendar-plus\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/is);
});

test("public header uses only the agreed CHAMPION name", async () => {
  const source = `${await readFile(layoutUrl, "utf8")}\n${await readFile(appShellUrl, "utf8")}`;
  assert.match(source, /ЧЕМПІОН/);
  assert.doesNotMatch(source, /Сузір.?я Чемпіонів|ДЮФК/i);
});

test("club branding uses the supplied emblem and yellow-black palette", async () => {
  const [layout, shell, login, mfa, reset, styles, manifest, worker] = await Promise.all([
    readFile(layoutUrl, "utf8"),
    readFile(appShellUrl, "utf8"),
    readFile(loginFormUrl, "utf8"),
    readFile(mfaGateUrl, "utf8"),
    readFile(passwordResetUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(manifestUrl, "utf8"),
    readFile(serviceWorkerUrl, "utf8"),
  ]);
  const brandedSurfaces = `${layout}\n${shell}\n${login}\n${mfa}\n${reset}\n${manifest}\n${worker}`;
  assert.match(brandedSurfaces, /champion-club-emblem\.jpg/);
  assert.doesNotMatch(brandedSurfaces, /champion-star\.svg/);
  assert.match(styles, /--gold:\s*#ffd400/i);
  assert.match(styles, /\.app-header[\s\S]{0,400}background:\s*#111/i);
  assert.match(styles, /\.primary-action\s*\{[^}]*background:\s*#ffd400/is);
  assert.match(styles, /\.calendar-plus\s*\{[^}]*border:\s*2px solid #111[^}]*background:\s*#ffd400/is);
});

test("private Sites does not hand page control to an application service worker", async () => {
  const [shell, gate, worker] = await Promise.all([
    readFile(appShellUrl, "utf8"),
    readFile(authGateUrl, "utf8"),
    readFile(serviceWorkerUrl, "utf8"),
  ]);
  assert.doesNotMatch(shell, /serviceWorker\.register/);
  assert.match(gate, /serviceWorker\.getRegistrations/);
  assert.match(gate, /registration\.unregister\(\)/);
  assert.doesNotMatch(gate, /location\.reload\(\)/);
  assert.doesNotMatch(worker, /addEventListener\(["']fetch/);
  assert.match(worker, /self\.registration\.unregister\(\)/);
});

test("event end time is maintained by a database trigger", async () => {
  const sql = await readModulesMigration();
  assert.match(sql, /create trigger events_set_end/i);
  assert.doesNotMatch(sql, /ends_at timestamptz generated always/i);
});

test("xlsx preview accepts only a clean caller-owned import asset", async () => {
  const source = await readFile(importPreviewUrl, "utf8");
  assert.match(source, /asset\.owner_id !== adminId/);
  assert.match(source, /asset\.bucket !== "imports"/);
  assert.match(source, /asset\.scan_status !== "clean"/);
  assert.doesNotMatch(source, /update\(\{ scan_status: "clean" \}\)/);
});

test("players expose only the two payment states and uniform workflow", async () => {
  const source = await readFile(coachPlayersUrl, "utf8");
  assert.match(source, /"paid" \| "unpaid"/);
  assert.match(source, />Оплачено</);
  assert.match(source, />Не оплачено</);
  assert.match(source, /Форма гравців/);
  assert.doesNotMatch(source, /дані не внесено.{0,30}оплат/is);
});

test("payment audit preserves an explicit actor for server-side writes", async () => {
  const sql = await readModulesMigration();
  assert.match(sql, /if \(select auth\.uid\(\)\) is not null then[\s\S]{0,120}new\.changed_by := \(select auth\.uid\(\)\)/i);
});

test("coach methodology is search-only for terms and includes all agreed tabs", async () => {
  const source = await readFile(coachMethodologyUrl, "utf8");
  assert.match(source, /label: "Термінологія"/);
  assert.match(source, /label: "Програма занять"/);
  assert.match(source, /label: "Структура заняття"/);
  assert.match(source, /Введіть слово або його частину/);
  assert.doesNotMatch(source, /type="file"/);
});

test("administrator can explicitly edit an existing terminology entry", async () => {
  const source = await readFile(adminMethodologyManagementUrl, "utf8");
  assert.match(source, /Редагування терміна/);
  assert.match(source, /Зберегти зміни/);
  assert.match(source, /onClick=\{\(\) => edit\(entry\)\}/);
  assert.match(source, /from\("terminology_entries"\)\.update\(payload\)\.eq\("id", editingId\)/);
  assert.match(source, /setTerm\(entry\.term\)/);
  assert.match(source, /setDefinition\(entry\.definition\)/);
  assert.match(source, /setCategory\(entry\.category\)/);
  assert.match(source, /setSource\(entry\.source \?\? ""\)/);
});

test("inventory permissions remain independent", async () => {
  const [source, sql] = await Promise.all([readFile(coachInventoryUrl, "utf8"), readModulesMigration()]);
  assert.match(source, /can_edit_quantity/);
  assert.match(source, /can_report_issues/);
  assert.match(sql, /permission_name = 'quantity'/);
  assert.match(sql, /permission_name = 'issues'/);
});

test("management starts with announcements then users and passwords and keeps every section closed", async () => {
  const source = await readFile(managementUrl, "utf8");
  const announcements = source.indexOf('title="Оголошення тренерам"');
  const users = source.indexOf('title="Користувачі й паролі"');
  const inventory = source.indexOf('title="Інвентар"');
  assert.ok(announcements >= 0 && announcements < users && users < inventory);
  assert.match(source, /useState<Section \| null>\(null\)/);
  assert.match(source, /current === value \? null : value/);
  assert.doesNotMatch(source, /champion:management-section:/);
});

test("announcement management and active workspace position survive routine navigation", async () => {
  const [management, shell, authGate, workspaceUi, styles] = await Promise.all([
    readFile(managementUrl, "utf8"),
    readFile(appShellUrl, "utf8"),
    readFile(authGateUrl, "utf8"),
    readFile(workspaceUiUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  assert.match(management, /Редагувати/);
  assert.match(management, /Видалити оголошення\?/);
  assert.match(management, /from\("announcements"\)\.update/);
  assert.match(management, /from\("announcements"\)\.delete/);
  assert.match(shell, /champion:active-view:/);
  assert.match(authGate, /readyUserId\.current === session\.user\.id/);
  assert.match(workspaceUi, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(styles, /\.accordion \{[^}]*scroll-margin-top:/);
});

test("administrative plan opens and edits the related event without duplicating report controls", async () => {
  const source = await readFile(adminPlanUrl, "utf8");
  assert.match(source, /Відкрити подію/);
  assert.match(source, /function AdminEventModal/);
  assert.match(source, /original_start_at:/);
  const sql = await readModulesMigration();
  assert.match(sql, /create or replace function private\.record_event_reschedule/i);
  assert.match(sql, /'reschedule', 'todo', 'Подію перенесено'/);
  const report = source.slice(source.indexOf("export function AdminReport"));
  assert.doesNotMatch(report, /updateStatus\(/);
  assert.match(report, /зміни вносяться тільки у Плані/i);
});

test("coach planning uses the agreed organizational-needs checklist", async () => {
  const source = await readFile(coachPlanUrl, "utf8");
  for (const need of ["Підготовка поля", "Автобус", "Оператор", "Лікар", "Документи", "Інше"]) {
    assert.match(source, new RegExp(need));
  }
  assert.match(source, /supportsOrganizationalNeeds/);
  const supportFunction = source.slice(source.indexOf("function supportsOrganizationalNeeds"), source.indexOf("function parseOrganizationalNeeds"));
  assert.doesNotMatch(supportFunction, /eventType === "training"/);
  assert.match(source, /eventType === "oblast"/);
  assert.match(source, /eventType === "ukraine"/);
  assert.match(source, /eventType === "tournament"/);
  assert.match(source, /serializeOrganizationalNeeds/);
  assert.match(source, /Організаційні потреби/);
});

test("coach conflict feedback stays visible and formats database time for Kyiv", async () => {
  const [plan, format, styles] = await Promise.all([
    readFile(coachPlanUrl, "utf8"),
    readFile(domainFormatUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  assert.match(plan, /conflictNoticeRef/);
  assert.match(plan, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(plan, /className=\{`span-2\$\{isConflict \? " conflict-notice"/);
  assert.match(format, /timeZone: "Europe\/Kyiv"/);
  assert.match(styles, /\.conflict-notice \{[^}]*position: sticky/);
});

test("corrected draft conflicts never remain in the administrator plan", async () => {
  const [coach, admin, exporter, cleanup] = await Promise.all([
    readFile(coachPlanUrl, "utf8"),
    readFile(adminPlanUrl, "utf8"),
    readFile(adminExportUrl, "utf8"),
    readFile(conflictCleanupMigrationUrl, "utf8"),
  ]);
  assert.doesNotMatch(coach, /item_type:\s*"conflict"[\s\S]{0,240}upsert/);
  assert.match(coach, /delete\(\)\.eq\("group_id", group\.id\)\.eq\("item_type", "conflict"\)/);
  assert.match(admin, /\.neq\("item_type", "conflict"\)/);
  assert.match(exporter, /\.neq\("item_type", "conflict"\)/);
  assert.match(cleanup, /delete from public\.operational_items[\s\S]*item_type = 'conflict'/i);
});

test("administrator groups remain visible without players and use explicit coach relations", async () => {
  const [groups, management, inventory] = await Promise.all([
    readFile(adminGroupsUrl, "utf8"),
    readFile(managementUrl, "utf8"),
    readFile(adminInventoryUrl, "utf8"),
  ]);
  assert.match(groups, /setMetrics\(emptyMetrics\)/);
  assert.match(groups, /coach:profiles!coach_group_assignments_coach_id_fkey/);
  assert.match(groups, /aria-label=\{`Відкрити групу \$\{group\.code\}`\}/);
  assert.match(groups, /function GroupDetailsModal/);
  assert.match(groups, /from\("players"\)\.select/);
  assert.match(groups, /<PlayerDetails client=\{client\}/);
  assert.doesNotMatch(groups, /if \(players\.error \|\| events\.error \|\| assignments\.error \|\| attendance\.error\).*return/s);
  assert.match(management, /coach_group_assignments!coach_group_assignments_coach_id_fkey/);
  assert.match(inventory, /coach_group_assignments!coach_group_assignments_coach_id_fkey/);
});

test("administrator group cards show current non-payment and past debt", async () => {
  const source = await readFile(adminGroupsUrl, "utf8");
  assert.match(source, /from\("monthly_payments"\)\.select\("player_id, month, status"\)/);
  assert.match(source, /Не сплачено за \{currentMonthName\}/);
  assert.match(source, /Є заборгованість/);
  assert.match(source, /row\.month < currentMonth && row\.status === "unpaid"/);
});

test("coach inventory separates post-training collection from inventory audit", async () => {
  const source = await readFile(coachInventoryUrl, "utf8");
  assert.match(source, /Зібрати після тренування/);
  assert.match(source, /Інвентаризація/);
  assert.match(source, /Пошкоджено/);
  assert.match(source, /Втрачено/);
  assert.match(source, /Потрібно придбати/);
  assert.doesNotMatch(source, /Кожна позиція обліковується окремо/);
});

test("administrator can export only debtors for the selected group", async () => {
  const source = await readFile(adminExportUrl, "utf8");
  assert.match(source, /async function exportDebts/);
  assert.match(source, /eq\("group_id", groupId\)/);
  assert.match(source, /Заборгованість гравців/);
  assert.match(source, /Неоплачені місяці/);
  assert.match(source, /ЧЕМПІОН_\$\{group\?\.code\}_заборгованість\.csv/);
  assert.match(source, /audit\("debts"/);
});

test("administrator user cards are compact and expand only on request", async () => {
  const source = await readFile(managementUrl, "utf8");
  assert.match(source, /useState<string \| null>\(null\)/);
  assert.match(source, /className="user-summary-button"/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /expanded && <div className="user-expanded-panel">/);
  assert.match(source, /Групи: \$\{assignedCodes\.join\(", "\)\}/);
  assert.match(source, /службовий тестовий запис без облікового запису Auth/);
});

test("coach signs in with login and password while MFA remains administrator-only", async () => {
  const [auth, login] = await Promise.all([
    readFile(authGateUrl, "utf8"),
    readFile(loginFormUrl, "utf8"),
  ]);
  assert.match(auth, /state\.profile\.role === "admin" && !mfaVerified/);
  assert.doesNotMatch(auth, /state\.profile\.role === "coach"[^\n]*MfaGate/);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(login, /!signInData\.session/);
  assert.match(login, /Тренер входить лише за логіном і паролем/);
  assert.match(login, /Двоетапне підтвердження застосовується тільки до адміністратора/);
});

test("uniform workflow locks coach edits and supports an administrative item filter", async () => {
  const [coach, admin, sql] = await Promise.all([
    readFile(coachPlayersUrl, "utf8"),
    readFile(adminUniformUrl, "utf8"),
    readModulesMigration(),
  ]);
  assert.match(coach, /status === "preparing" \|\| request\?\.status === "issued"/);
  assert.match(coach, /rpc\("save_uniform_request"/);
  assert.match(admin, /Позиція форми/);
  assert.match(admin, /Нова позиція/);
  assert.match(admin, /from\("uniform_catalog_items"\)[\s\S]{0,80}\.insert/);
  assert.match(admin, /row\.status === "requested" \|\| row\.status === "preparing"/);
  assert.match(sql, /old\.status in \('preparing', 'issued'\)/i);
  assert.match(sql, /create or replace function public\.save_uniform_request/i);
});

test("private files remain pending until server-side validation", async () => {
  const [upload, validation, sql] = await Promise.all([
    readFile(fileUploadUrl, "utf8"),
    readFile(fileValidationUrl, "utf8"),
    readModulesMigration(),
  ]);
  assert.match(upload, /scan_status: "pending"/);
  assert.match(upload, /functions\.invoke\("file-validate"/);
  assert.match(validation, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(validation, /ACTIVE_PDF_CONTENT/);
  assert.match(validation, /asset\.scan_status !== "pending"/);
  assert.match(sql, /new\.scan_status := 'pending'/i);
  assert.match(sql, /f\.scan_status = 'clean'/i);
});

test("file access helper uses a scalar identifier instead of a composite argument", async () => {
  const sql = await readModulesMigration();
  assert.match(sql, /private\.can_read_file_asset\(requested_asset_id uuid\)/);
  assert.match(sql, /where asset\.id = requested_asset_id/);
  assert.match(sql, /private\.can_read_file_asset\(id\)/);
  assert.match(sql, /grant execute on function private\.can_read_file_asset\(uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /private\.can_read_file_asset\(asset public\.file_assets\)/);
  assert.match(sql, /as ages\(age\)/);
  assert.doesNotMatch(sql, /generate_series\([^\n]+\) age where/);
});

test("Data API grants are reduced to the application access matrix", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /revoke all privileges on all tables in schema public from anon, authenticated/i);
  assert.match(sql, /revoke execute on all functions in schema public from anon/i);
  assert.match(sql, /revoke all privileges on tables from anon, authenticated/i);
  assert.match(sql, /grant select on public\.audit_log to authenticated/i);
  assert.match(sql, /grant select on[\s\S]+public\.task_usage[\s\S]+to authenticated/i);
  assert.doesNotMatch(sql, /grant (?:all|truncate|references|trigger)[\s\S]+to authenticated/i);
});

test("every public foreign key receives a covering index", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /constraint_row\.contype = 'f'/i);
  assert.match(sql, /create index if not exists %I on %I\.%I \(%s\)/i);
  assert.match(sql, /existing_index\.indkey::smallint\[\]/i);
});

test("event task files are linked atomically by a group-scoped database function", async () => {
  const [coach, sql] = await Promise.all([
    readFile(coachPlanUrl, "utf8"),
    readModulesMigration(),
  ]);
  assert.match(coach, /rpc\("attach_event_task_material"/);
  assert.match(sql, /create or replace function public\.attach_event_task_material/i);
  assert.match(sql, /insert into public\.event_materials/i);
  assert.match(sql, /insert into public\.methodology_materials/i);
  assert.match(sql, /private\.has_group\(target_group_id\)/i);
});

test("attendance is saved atomically and stale offline data cannot overwrite newer data", async () => {
  const [queue, sql] = await Promise.all([
    readFile(attendanceQueueUrl, "utf8"),
    readModulesMigration(),
  ]);
  assert.match(queue, /rpc\("save_attendance"/);
  assert.match(queue, /queuedAttendance\(completedBy/);
  assert.match(sql, /create or replace function public\.save_attendance/i);
  assert.match(sql, /Attendance must contain every active player exactly once/);
  assert.match(sql, /attendance_sessions\.client_created_at <= excluded\.client_created_at/);
  assert.doesNotMatch(sql, /create policy attendance_sessions_coach_insert/);
});

test("batch import detects duplicates and confirms through one MFA transaction", async () => {
  const [source, sql, groupScopedSql, preview] = await Promise.all([
    readFile(importManagementUrl, "utf8"),
    readModulesMigration(),
    readFile(importGroupScopeMigrationUrl, "utf8"),
    readFile(importPreviewUrl, "utf8"),
  ]);
  assert.match(source, /parseDelimited/);
  assert.match(source, /Дублікат у цьому файлі/);
  assert.match(source, /rpc\("confirm_import_job"/);
  assert.match(source, /champion-import-template\.xlsx/);
  assert.match(source, /champion-import-template\.docx/);
  assert.match(source, /accept="\.csv,\.xlsx,\.docx"/);
  assert.match(source, /physical_tests: \["group", "player", "date", "metric", "field", "value"\]/);
  assert.match(source, /game_activity: \["group", "player", "period", "metric", "value"\]/);
  assert.doesNotMatch(source, /from\("players"\)\.insert\(payload\)/);
  assert.match(sql, /create or replace function public\.confirm_import_job/i);
  assert.match(sql, /Administrator MFA required/);
  assert.match(groupScopedSql, /where group_id = target_group_id[\s\S]{0,120}lower\(full_name\)/i);
  assert.match(groupScopedSql, /Player must be unique in group/);
  assert.match(groupScopedSql, /players_group_lower_name_active_idx/i);
  assert.match(preview, /physical_tests: \["group", "player", "date", "metric", "field", "value"\]/);
  assert.match(preview, /collectSessionMetadata/);
  assert.match(preview, /npm:jszip@3\.10\.1/);
  assert.match(preview, /word\/document\.xml/);
  assert.match(preview, /workbook\.SheetNames\.flatMap/);
});

test("Excel import templates are bundled for players and evaluation results", async () => {
  const files = await Promise.all([
    readFile(playerImportTemplateUrl),
    readFile(physicalImportTemplateUrl),
    readFile(gameActivityImportTemplateUrl),
  ]);
  for (const file of files) {
    assert.ok(file.length > 5000, "XLSX template must not be empty");
    assert.equal(file.subarray(0, 2).toString("utf8"), "PK");
  }
});

test("universal Excel and Word import templates are bundled", async () => {
  const [excel, word] = await Promise.all([
    readFile(universalExcelTemplateUrl),
    readFile(universalWordTemplateUrl),
  ]);
  assert.ok(excel.length > 10000, "universal XLSX template must not be empty");
  assert.ok(word.length > 10000, "universal DOCX template must not be empty");
  assert.equal(excel.subarray(0, 2).toString("utf8"), "PK");
  assert.equal(word.subarray(0, 2).toString("utf8"), "PK");
});

test("goalkeeper announcements and general methodology sections have group-safe access", async () => {
  const [sql, management, methodology] = await Promise.all([
    readFile(libraryMigrationUrl, "utf8"),
    readFile(managementUrl, "utf8"),
    readFile(coachMethodologyUrl, "utf8"),
  ]);
  assert.match(sql, /target_type in \('all', 'coach', 'age', 'group'\)/i);
  assert.match(sql, /t\.target_type = 'group'[\s\S]{0,100}private\.has_group\(t\.group_id\)/i);
  assert.match(sql, /create table public\.methodology_sections/i);
  assert.match(sql, /create table public\.methodology_section_materials/i);
  assert.match(sql, /methodology_section_materials sm[\s\S]{0,140}sm\.is_active and s\.is_active/i);
  assert.match(management, /Конкретні групи/);
  assert.match(management, /group_id/);
  assert.match(methodology, /Методична бібліотека/);
});

test("evaluation names come from administrator-managed catalogs", async () => {
  const [sql, ageBandsSql, management, importer, exporter] = await Promise.all([
    readFile(evaluationMigrationUrl, "utf8"),
    readFile(evaluationAgeBandsMigrationUrl, "utf8"),
    readFile(evaluationManagementUrl, "utf8"),
    readFile(importManagementUrl, "utf8"),
    readFile(adminExportUrl, "utf8"),
  ]);
  assert.match(sql, /create table public\.evaluation_metrics/i);
  assert.match(sql, /'physical_preparedness', 'game_activity'/i);
  assert.match(sql, /alter table public\.evaluation_metrics enable row level security/i);
  assert.match(sql, /alter column metric_id set not null/i);
  assert.match(sql, /EVALUATION_METRIC_NOT_FOUND/);
  assert.match(ageBandsSql, /age_from = 6 and age_to = 12/i);
  assert.match(ageBandsSql, /age_from = 13 and age_to = 15/i);
  assert.match(ageBandsSql, /active_count >= 4/i);
  assert.match(ageBandsSql, /Лідерські якості/);
  assert.match(ageBandsSql, /Психоемоційна підготовленість/);
  assert.match(ageBandsSql, /Тактико-технічна підготовленість/);
  assert.match(management, /Тестування фізичної підготовленості/);
  assert.match(management, /Складові ігрової діяльності/);
  assert.match(management, /Фізичні тести · U6–U12/);
  assert.match(management, /Фізичні тести · U13–U15/);
  assert.match(management, /4 активні тести/);
  assert.match(importer, /Показник відсутній в активному довіднику адміністратора/);
  assert.match(importer, /Тест відсутній в активному наборі U/);
  assert.match(exporter, /Тестування фізичної підготовленості/);
});

test("physical batteries keep four tests with their exact result fields", async () => {
  const [sql, management, importer, coach, exporter, preview] = await Promise.all([
    readFile(physicalComponentsMigrationUrl, "utf8"),
    readFile(evaluationManagementUrl, "utf8"),
    readFile(importManagementUrl, "utf8"),
    readFile(coachPlayersUrl, "utf8"),
    readFile(adminExportUrl, "utf8"),
    readFile(importPreviewUrl, "utf8"),
  ]);
  assert.match(sql, /create table public\.evaluation_metric_fields/i);
  assert.match(sql, /create table public\.physical_test_sessions/i);
  assert.match(sql, /'Тест 505', 'Оббігання справа', 'с'/);
  assert.match(sql, /'Тест 505', 'Оббігання зліва', 'с'/);
  assert.match(sql, /'Стрибок у довжину', 'Краща спроба', 'см'/);
  assert.match(sql, /'Біг', '40 м', 'с'/);
  assert.match(sql, /'Біг', '20 м', 'с'/);
  assert.match(sql, /'Yo-Yo IR1', 'Дистанція', 'м'/);
  assert.match(sql, /Фіксується лише краща спроба/);
  assert.match(sql, /Фіксується подолана дистанція у метрах/);
  assert.match(sql, /player_age between 13 and 17/);
  assert.match(sql, /PLAYER_AGE_REQUIRED_FOR_PHYSICAL_TEST/);
  assert.match(sql, /create or replace function public\.save_physical_evaluation_metric/i);
  assert.match(sql, /lower\(field_name\) = lower\(item\.payload ->> 'field'\)/i);
  assert.match(management, /Поля результату цього тесту/);
  assert.match(management, /тест 505 має оббігання справа і зліва/i);
  assert.match(importer, /5 полів для U6–U12 і 6 для U13–U15/);
  assert.match(importer, /воротарів 9–12 років.{0,160}воротарів 13–17/);
  assert.match(importer, /evaluation_metric_fields/);
  assert.match(coach, /<th>Тест<\/th><th>Поле результату<\/th>/);
  assert.match(exporter, /"Поле результату"/);
  assert.match(exporter, /physical_test_sessions/);
  assert.match(preview, /sessionMetadata/);
});

test("an expired admin assurance level returns to MFA instead of showing an empty group list", async () => {
  const [auth, shell, mfa, login] = await Promise.all([
    readFile(authGateUrl, "utf8"),
    readFile(appShellUrl, "utf8"),
    readFile(mfaGateUrl, "utf8"),
    readFile(loginFormUrl, "utf8"),
  ]);
  assert.match(auth, /onMfaRequired=\{handleMfaRequired\}/);
  assert.match(shell, /getAuthenticatorAssuranceLevel/);
  assert.match(shell, /auth\.refreshSession\(\)/);
  assert.match(shell, /onMfaRequired\?\.\(\)/);
  assert.match(mfa, /currentLevel !== "aal2"/);
  assert.match(login, /Кожна дитина — зірка\. Наше завдання — допомогти їй розкрити своє світло\./);
});

test("staff session keeps a workday default and a short shared-device mode", async () => {
  const [source, login] = await Promise.all([
    readFile(sessionTimeoutUrl, "utf8"),
    readFile(loginFormUrl, "utf8"),
  ]);
  assert.match(source, /const WORKDAY_IDLE_LIMIT_MS = 8 \* 60 \* 60 \* 1000/);
  assert.match(source, /const SHARED_DEVICE_IDLE_LIMIT_MS = 30 \* 60 \* 1000/);
  assert.match(source, /champion:shared-device/);
  assert.match(source, /client\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(source, /Продовжити роботу/);
  assert.match(login, /Це спільний комп’ютер/);
});

test("administrator user creation refreshes MFA and validates a generated temporary password", async () => {
  const [management, edge] = await Promise.all([
    readFile(managementUrl, "utf8"),
    readFile(adminUsersFunctionUrl, "utf8"),
  ]);
  assert.match(management, /auth\.refreshSession\(\)/);
  assert.match(management, /generateTemporaryPassword/);
  assert.match(management, /Групи тренера/);
  assert.match(management, /PASSWORD_POLICY/);
  assert.match(edge, /passwordMeetsPolicy/);
  assert.match(edge, /GROUP_ASSIGNMENT_FAILED/);
});

test("approved methodology content is reproducible from the repository", async () => {
  const [seed, rootSeed, glossary, management] = await Promise.all([
    readFile(methodologySeedUrl, "utf8"),
    readFile(seedUrl, "utf8"),
    readFile(new URL("../supabase/migrations/20260918064008_glossary_term_category_key.sql", import.meta.url), "utf8"),
    readFile(adminMethodologyManagementUrl, "utf8"),
  ]);
  assert.ok(seed.length > 160_000, "approved methodology seed must not be truncated");
  assert.match(seed, /jsonb_to_recordset\(\$champion_tasks\$/);
  assert.match(seed, /jsonb_to_recordset\(\$champion_terms\$/);
  assert.match(rootSeed, /\\ir seed\/20260918_methodology_content\.sql/);
  assert.match(glossary, /unique \(term, category\)/i);
  assert.match(management, /onConflict: "term,category"/);
});

test("administrators can edit, order and deactivate methodology content", async () => {
  const [program, structure, sql] = await Promise.all([
    readFile(programManagementUrl, "utf8"),
    readFile(structureManagementUrl, "utf8"),
    readModulesMigration(),
  ]);
  assert.match(program, /Редагування завдання/);
  assert.match(program, /rpc\("move_methodology_task"/);
  assert.match(structure, /Редагування структури/);
  assert.match(structure, /rpc\("move_training_step"/);
  assert.match(structure, /Деактивувати/);
  assert.match(sql, /create or replace function public\.move_methodology_task/i);
});

test("inventory supports deactivation and independent bulk permissions", async () => {
  const source = await readFile(adminInventoryUrl, "utf8");
  assert.match(source, /update\(\{ is_active: false/);
  assert.match(source, /Дозволити всім/);
  assert.match(source, /can_edit_quantity/);
  assert.match(source, /can_report_issues/);
});

test("administrative backup is encrypted before download", async () => {
  const [source, helper] = await Promise.all([
    readFile(adminExportUrl, "utf8"),
    readFile(new URL("../lib/domain/backup.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /encryptBackup\(JSON\.stringify\(data\), passphrase\)/);
  assert.match(source, /\.encrypted\.json/);
  assert.match(helper, /AES-GCM/);
  assert.match(helper, /PBKDF2/);
});

test("operating guides cover trainers, administrators, deployment and restore", async () => {
  for (const path of [
    "../docs/trainer-guide.md",
    "../docs/admin-guide.md",
    "../docs/deployment.md",
    "../docs/backup-restore.md",
  ]) {
    const content = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(content.length > 500, `${path} must contain an operating procedure`);
  }
});

test("staging fixture is synthetic, non-login and fully removable", async () => {
  const [fixture, cleanup] = await Promise.all([
    readFile(stagingFixtureUrl, "utf8"),
    readFile(stagingFixtureCleanupUrl, "utf8"),
  ]);
  assert.match(fixture, /STAGING ONLY/);
  assert.match(fixture, /\[ТЕСТ\]/);
  assert.match(fixture, /email, encrypted_password/);
  assert.match(fixture, /null,\s*null,[\s\S]{0,220}'2126-01-01 00:00:00\+00'/i);
  assert.match(fixture, /phone, email, created_by, updated_by[\s\S]+null, null/i);
  assert.match(fixture, /'paid'/);
  assert.match(fixture, /'unpaid'/);
  assert.match(cleanup, /delete from auth\.users where id = '11111111-1111-4111-8111-111111111111'/i);
});
