import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { A4_LANDSCAPE_PDF_HEIGHT_PT, A4_LANDSCAPE_PDF_WIDTH_PT, buildA4AwardSheetsPdf } from "../lib/domain/monthly-star-award-pdf.ts";

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
const monthlyStarAwardPdfUrl = new URL("../lib/domain/monthly-star-award-pdf.ts", import.meta.url);
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
const monthlyStarMigrationUrl = new URL("../supabase/migrations/20260926195000_monthly_star_program.sql", import.meta.url);
const monthlyStarVoidMigrationUrl = new URL("../supabase/migrations/20260926195500_monthly_star_void_security.sql", import.meta.url);
const monthlyStarAwardMigrationUrl = new URL("../supabase/migrations/20260926200500_monthly_star_award_rpc.sql", import.meta.url);
const monthlyStarGuardMigrationUrl = new URL("../supabase/migrations/20260926204000_monthly_star_generated_month_guard.sql", import.meta.url);
const coachDeletionMigrationUrl = new URL("../supabase/migrations/20260926203000_coach_deletion_history.sql", import.meta.url);
const monthlyStarUiUrl = new URL("../components/star/monthly-star.tsx", import.meta.url);
const monthlyStarManagementUrl = new URL("../components/admin/monthly-star-management.tsx", import.meta.url);
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
const ageExtensionMigrationUrl = new URL("../supabase/migrations/20260927103625_extend_groups_and_player_characteristics.sql", import.meta.url);
const coachPhotoCardScopeMigrationUrl = new URL("../supabase/migrations/20260927194151_coach_photo_attendance_card_scope.sql", import.meta.url);
const coachPhotoTrainingRulesMigrationUrl = new URL("../supabase/migrations/20260928092916_coach_photo_and_training_card_rules.sql", import.meta.url);
const behaviorCardPolicyScopeMigrationUrl = new URL("../supabase/migrations/20260928093957_qualify_behavior_card_policy_scope.sql", import.meta.url);
const playerPhotoAssetRegistrationMigrationUrl = new URL("../supabase/migrations/20260928172946_register_player_photo_asset.sql", import.meta.url);
const ageGroupsDomainUrl = new URL("../lib/domain/age-groups.ts", import.meta.url);
const workingModulesSchemaUrl = new URL("../supabase/migrations/20260917154737_working_modules_schema_0_2_2.sql", import.meta.url);

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
  for (let age = 8; age <= 17; age += 1) expected.push(`U${age}A`, `U${age}B`);
  assert.deepEqual(codes, expected);
  const goalkeeperCodes = [...sql.matchAll(/\('(Воротарі [ABC])',\s*null,\s*'[ABC]',\s*'goalkeeper'/g)].map((item) => item[1]);
  assert.deepEqual(goalkeeperCodes, ["Воротарі A", "Воротарі B", "Воротарі C"]);
});

test("U16 and U17 are supported across schema, controls and imports", async () => {
  const [migration, ages, management, importer] = await Promise.all([
    readFile(ageExtensionMigrationUrl, "utf8"),
    readFile(ageGroupsDomainUrl, "utf8"),
    readFile(managementUrl, "utf8"),
    readFile(importManagementUrl, "utf8"),
  ]);
  for (const code of ["U16A", "U16B", "U17A", "U17B"]) {
    assert.match(migration, new RegExp(`'${code}'`));
  }
  assert.match(migration, /age between 6 and 17/i);
  assert.match(migration, /age between 8 and 17/i);
  assert.match(migration, /methodology_tasks_age_range_v2_check[\s\S]{0,100}age_to between 6 and 17/i);
  assert.match(migration, /training_structures_age_range_v2_check[\s\S]{0,100}age_to between 6 and 17/i);
  assert.match(migration, /announcement_targets_age_v2_check[\s\S]{0,80}age between 6 and 17/i);
  assert.match(migration, /Структура заняття U9–U17/);
  assert.match(ages, /MAX_AGE_GROUP = 17/);
  assert.match(management, /AGE_GROUP_VALUES/);
  assert.match(importer, /MAX_AGE_GROUP/);
});

test("coach characteristic is optional, attributed and group-scoped", async () => {
  const [migration, coachPlayers, adminGroups] = await Promise.all([
    readFile(ageExtensionMigrationUrl, "utf8"),
    readFile(coachPlayersUrl, "utf8"),
    readFile(adminGroupsUrl, "utf8"),
  ]);
  for (const column of ["coach_note_author_id", "coach_note_author_name", "coach_note_updated_at"]) {
    assert.match(migration, new RegExp(`add column ${column}`));
    assert.match(adminGroups, new RegExp(column));
  }
  assert.match(migration, /create or replace function public\.save_player_coach_note/i);
  assert.match(migration, /profile\.role = 'coach'[\s\S]{0,120}profile\.status = 'active'/i);
  assert.match(migration, /private\.has_group\(target_group_id\)/i);
  assert.match(migration, /char_length\(prepared_note\) > 2000/i);
  assert.match(migration, /revoke all on function public\.save_player_coach_note\(uuid, text\) from public/i);
  assert.match(coachPlayers, /Коротка характеристика тренера/);
  assert.match(coachPlayers, /rpc\("save_player_coach_note"/);
  assert.match(coachPlayers, /canEditCoachNote = profile\?\.role === "coach"/);
  assert.doesNotMatch(coachPlayers, /автоматично сформован.{0,30}характеристик/i);
});

test("player uniform status accepts the one-to-one relation returned by PostgREST", async () => {
  const [schema, coachPlayers, adminGroups] = await Promise.all([
    readFile(workingModulesSchemaUrl, "utf8"),
    readFile(coachPlayersUrl, "utf8"),
    readFile(adminGroupsUrl, "utf8"),
  ]);
  assert.match(schema, /player_id uuid not null unique references public\.players\(id\)/i);
  for (const source of [coachPlayers, adminGroups]) {
    assert.match(source, /uniform_requests\?: Relation<\{ id: string; status: UniformStatus \}>/);
    assert.match(source, /relationOne\(player\.uniform_requests\)\?\.status === "issued"/);
    assert.doesNotMatch(source, /uniform_requests\?\.some/);
  }
});

test("administrator export offers all groups without losing individual selection", async () => {
  const [exporter, workspace] = await Promise.all([
    readFile(adminExportUrl, "utf8"),
    readFile(workspaceUiUrl, "utf8"),
  ]);
  assert.match(exporter, /const ALL_GROUPS_VALUE = "__all_groups__"/);
  assert.match(exporter, /label: "Усі групи"/);
  assert.match(exporter, /if \(!allGroups\) query = query\.eq\("players\.group_id", groupId\)/);
  assert.match(exporter, /all_groups: allGroups/);
  assert.match(workspace, /allOption\?: \{ value: string; label: string \}/);
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
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.calendar-weekdays, \.calendar-grid \{ min-width: 0; \}/);
});

test("event date and time round-trip in the Kyiv time zone", async () => {
  const { combineKyivDateTime, toKyivDateInput, toKyivTimeInput } = await import("../lib/domain/format.ts");
  const winter = combineKyivDateTime("2026-01-15", "17:00");
  const summer = combineKyivDateTime("2026-09-28", "17:00");
  assert.equal(winter, "2026-01-15T15:00:00.000Z");
  assert.equal(summer, "2026-09-28T14:00:00.000Z");
  assert.equal(toKyivDateInput(summer), "2026-09-28");
  assert.equal(toKyivTimeInput(summer), "17:00");
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
  assert.match(login, /<strong>Клуб Чемпіон<\/strong>/);
  assert.match(mfa, /<strong>Клуб Чемпіон<\/strong>/);
  assert.match(reset, /<strong>Клуб Чемпіон<\/strong>/);
  assert.match(shell, /<strong>ЧЕМПІОН<\/strong>/);
  assert.doesNotMatch(login, /команди школи/i);
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
  const supportFunction = source.slice(source.indexOf("function supportsOrganizationalNeeds"), source.indexOf("function supportsBehaviorCards"));
  assert.doesNotMatch(supportFunction, /eventType === "training"/);
  assert.match(source, /eventType === "oblast"/);
  assert.match(source, /eventType === "ukraine"/);
  assert.match(source, /eventType === "tournament"/);
  assert.match(source, /serializeOrganizationalNeeds/);
  assert.match(source, /Організаційні потреби/);
});

test("coach plan accepts the one-to-one attendance session returned by PostgREST", async () => {
  const source = await readFile(coachPlanUrl, "utf8");
  assert.match(source, /Array\.isArray\(value\) \? value : value \? \[value\] : \[\]/);
  assert.match(source, /attendanceSessions\(event\)\.some/);
  assert.doesNotMatch(source, /\(event\.attendance_sessions \?\? \[\]\)\.some/);
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
  assert.match(plan, /Час \(Київ\)/);
  assert.match(plan, /combineKyivDateTime/);
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

test("administrator group details tolerate missing assignments and show the shared monthly event plan", async () => {
  const [groups, format] = await Promise.all([
    readFile(adminGroupsUrl, "utf8"),
    readFile(domainFormatUrl, "utf8"),
  ]);
  assert.match(groups, /Тренера не призначено/);
  assert.match(groups, /function relationOne/);
  assert.match(groups, /function GroupMonthlyPlan/);
  assert.match(groups, /from\("events"\)[\s\S]*profiles!events_coach_id_fkey\(full_name\)/);
  assert.match(groups, /\.eq\("group_id", group\.id\)/);
  assert.match(groups, /Єдиний план подій/);
  assert.match(groups, /Список/);
  assert.match(groups, /Календар/);
  assert.match(groups, /Видалений тренер/);
  assert.match(groups, /kyivMonthBounds\(month\)/);
  assert.match(format, /Europe\/Kyiv/);
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

test("administrator can export only debtors for one group or all groups", async () => {
  const source = await readFile(adminExportUrl, "utf8");
  assert.match(source, /async function exportDebts/);
  assert.match(source, /eq\("group_id", groupId\)/);
  assert.match(source, /Заборгованість гравців/);
  assert.match(source, /Неоплачені місяці/);
  assert.match(source, /ЧЕМПІОН_\$\{selectionFileLabel\}_заборгованість\.csv/);
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
  assert.match(source, /champion-import-physical-tests\.xlsx/);
  assert.match(source, /Спільна дата тестування/);
  assert.match(source, /default_date:/);
  assert.match(source, /uniqueMessages/);
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
  assert.match(preview, /normalizeDate/);
  assert.match(preview, /default_date\?: string/);
  assert.match(preview, /cellDates: true/);
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
  const [sql, ageBandsSql, extensionSql, ageGroups, management, importer, exporter] = await Promise.all([
    readFile(evaluationMigrationUrl, "utf8"),
    readFile(evaluationAgeBandsMigrationUrl, "utf8"),
    readFile(ageExtensionMigrationUrl, "utf8"),
    readFile(ageGroupsDomainUrl, "utf8"),
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
  assert.match(extensionSql, /age_from = 13 and age_to = 17/i);
  assert.match(ageBandsSql, /active_count >= 4/i);
  assert.match(ageBandsSql, /Лідерські якості/);
  assert.match(ageBandsSql, /Психоемоційна підготовленість/);
  assert.match(ageBandsSql, /Тактико-технічна підготовленість/);
  assert.match(management, /Тестування фізичної підготовленості/);
  assert.match(management, /Складові ігрової діяльності/);
  assert.match(ageGroups, /label: "U6–U12"/);
  assert.match(ageGroups, /label: "U13–U17"/);
  assert.match(management, /YOUNGER_PHYSICAL_TEST_BAND\.label/);
  assert.match(management, /OLDER_PHYSICAL_TEST_BAND\.label/);
  assert.match(management, /4 активні тести/);
  assert.match(importer, /Показник відсутній в активному довіднику адміністратора/);
  assert.match(importer, /Тест відсутній в активному наборі U/);
  assert.match(exporter, /Тестування фізичної підготовленості/);
});

test("physical batteries keep four tests with their exact result fields", async () => {
  const [sql, extensionSql, management, importer, coach, exporter, preview] = await Promise.all([
    readFile(physicalComponentsMigrationUrl, "utf8"),
    readFile(ageExtensionMigrationUrl, "utf8"),
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
  assert.match(extensionSql, /player_age not between 6 and 17/);
  assert.doesNotMatch(extensionSql, /player_age\s*:=\s*15/);
  assert.match(extensionSql, /PLAYER_AGE_REQUIRED_FOR_PHYSICAL_TEST/);
  assert.match(extensionSql, /create or replace function public\.save_physical_evaluation_metric/i);
  assert.match(sql, /lower\(field_name\) = lower\(item\.payload ->> 'field'\)/i);
  assert.match(management, /Поля результату цього тесту/);
  assert.match(management, /тест 505 має оббігання справа і зліва/i);
  assert.match(importer, /5 полів для U6–U12 і 6 для U13–U17/);
  assert.match(importer, /воротарів 9–12 років.{0,160}воротарів 13–17/);
  assert.match(importer, /evaluation_metric_fields/);
  assert.match(coach, /<th>Тест<\/th><th>Поле результату<\/th>/);
  assert.match(exporter, /"Поле результату"/);
  assert.match(exporter, /physical_test_sessions/);
  assert.match(preview, /sessionMetadata/);
});

test("monthly star data model enforces private group scope and monthly eligibility", async () => {
  const sql = await readFile(monthlyStarMigrationUrl, "utf8");
  for (const table of ["monthly_star_themes", "player_behavior_cards", "parent_contact_actions", "monthly_star_awards"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /timezone\('Europe\/Kyiv', now\(\)\)/i);
  assert.match(sql, /where c\.player_id = new\.player_id and c\.month = new\.month and not c\.is_voided/i);
  assert.match(sql, /if active_cards >= 4/i);
  assert.match(sql, /PLAYER_INELIGIBLE_FOR_MONTHLY_STAR/);
  assert.match(sql, /monthly_star_awards_player_active_idx/);
  assert.match(sql, /public\.void_behavior_card/i);
  assert.match(sql, /private\.has_group\(group_id\)/i);
  assert.match(sql, /coach_choice', 'team_choice/);
  assert.doesNotMatch(sql, /leaderboard|worst/i);
});

test("monthly star workflow is complete without public rankings or player voting", async () => {
  const [ui, admin, coachPlan, coachPlayers, voidSql, awardSql, guardSql, exporter] = await Promise.all([
    readFile(monthlyStarUiUrl, "utf8"),
    readFile(monthlyStarManagementUrl, "utf8"),
    readFile(coachPlanUrl, "utf8"),
    readFile(coachPlayersUrl, "utf8"),
    readFile(monthlyStarVoidMigrationUrl, "utf8"),
    readFile(monthlyStarAwardMigrationUrl, "utf8"),
    readFile(monthlyStarGuardMigrationUrl, "utf8"),
    readFile(adminExportUrl, "utf8"),
  ]);
  assert.match(ui, /ЗІРКА МІСЯЦЯ/);
  for (const label of ["Запізнення", "Порушення дисципліни", "Невиконання вимог тренера", "Порушення правил безпеки", "Неспортивна поведінка", "Неповага", "Інше"]) assert.match(ui, new RegExp(label));
  assert.match(ui, /Необхідний контакт із батьками/);
  assert.match(ui, /currentCards\.length >= 4/);
  assert.match(ui, /Вибір тренера/);
  assert.match(ui, /Вибір команди/);
  assert.match(ui, /Два різні переможці/);
  assert.match(ui, /Досягнення та поведінка/);
  assert.match(admin, /Збережена історія/);
  assert.match(admin, /Теми місяців/);
  assert.match(coachPlan, /MonthlyStarThemeBanner/);
  assert.match(coachPlan, /BehaviorCardAction/);
  assert.match(coachPlayers, /MonthlyStarGroupPanel/);
  assert.match(coachPlayers, /PlayerAchievementBehavior/);
  assert.match(voidSql, /security invoker/i);
  assert.match(voidSql, /ONLY_CARD_VOIDING_IS_ALLOWED/);
  assert.match(guardSql, /array\['month', 'is_voided', 'voided_at', 'voided_by', 'void_reason', 'updated_at'\]/);
  assert.match(awardSql, /save_monthly_star_awards/);
  assert.match(awardSql, /security invoker/i);
  for (const table of ["monthly_star_themes", "player_behavior_cards", "parent_contact_actions", "monthly_star_awards"]) assert.match(exporter, new RegExp(`"${table}"`));
  assert.doesNotMatch(ui, /player_vote|public_leaderboard/i);
});

test("coach photo, attendance and card workflow is mobile-friendly and admin read-only", async () => {
  const [coachPlayers, coachPlan, monthlyStarUi, adminMonthlyStar, scopeSql, trainingRulesSql, policyScopeSql, photoRegistrationSql, files] = await Promise.all([
    readFile(coachPlayersUrl, "utf8"),
    readFile(coachPlanUrl, "utf8"),
    readFile(monthlyStarUiUrl, "utf8"),
    readFile(monthlyStarManagementUrl, "utf8"),
    readFile(coachPhotoCardScopeMigrationUrl, "utf8"),
    readFile(coachPhotoTrainingRulesMigrationUrl, "utf8"),
    readFile(behaviorCardPolicyScopeMigrationUrl, "utf8"),
    readFile(playerPhotoAssetRegistrationMigrationUrl, "utf8"),
    readFile(fileUploadUrl, "utf8"),
  ]);

  assert.match(coachPlayers, /capture="environment"/);
  assert.match(coachPlayers, /Сфотографувати/);
  assert.match(coachPlayers, /Вибрати з галереї/);
  assert.match(coachPlayers, /uploadPrivateFile/);
  assert.match(coachPlayers, /set_player_photo/);
  assert.match(coachPlayers, /player_photos\(is_current/);
  assert.match(coachPlayers, /find\(\(photo\) => photo\.is_current\)/);
  assert.match(coachPlayers, /className="player-photo-trigger"/);
  assert.match(coachPlayers, /age: null/);
  assert.ok(coachPlayers.indexOf("parent-contacts-priority") < coachPlayers.indexOf("coach-characteristic"), "parent contacts must appear immediately after the player's basic photo information");
  assert.match(files, /deletePrivateFile/);
  assert.match(files, /rpc\("register_player_photo_asset"/);

  assert.match(coachPlan, /Присутність ·/);
  assert.match(coachPlan, /Жовті картки ·/);
  assert.match(coachPlan, /Присутній/);
  assert.match(coachPlan, /Відсутній/);
  assert.match(coachPlan, /Усі присутні/);
  assert.match(coachPlan, /Картку зафіксовано/);
  assert.ok(coachPlan.includes("onSaved={(attendanceSynced)"));
  assert.match(coachPlan, /setBehaviorAfterAttendance\(true\)/);
  assert.match(coachPlan, /setEventMode\(\{ kind: "view", event: closedEvent \}\)/);
  assert.match(coachPlan, /Присутність збережено\. За потреби додайте жовті картки/);
  assert.ok((coachPlan.match(/void load\(true\)/g) ?? []).length >= 2, "attendance/card transitions refresh data without hiding the active workflow");
  assert.match(coachPlan, /onSaved\(true\)/);
  assert.match(coachPlan, /onSaved\(false\)/);
  assert.match(coachPlan, /occurredOn=\{kyivDateKey\(event\.start_at\)\}/);
  assert.doesNotMatch(coachPlan, /Причина або примітка — необов’язково/);
  assert.equal((coachPlayers.match(/BehaviorCardAction/g) ?? []).length, 0, "the player list and profile must not duplicate card assignment");
  assert.equal((coachPlan.match(/<BehaviorCardAction/g) ?? []).length, 1, "the separate training-card screen is the single coach card-assignment point");
  assert.doesNotMatch(monthlyStarUi, /label="Додати картку"/);
  assert.doesNotMatch(monthlyStarUi, /label="Картка"/);
  assert.doesNotMatch(monthlyStarUi, /window\.prompt/);
  assert.match(monthlyStarUi, /function VoidBehaviorCardAction/);
  assert.match(monthlyStarUi, /Активні жовті картки/);
  assert.match(monthlyStarUi, /Причина:<\/strong>/);
  assert.match(monthlyStarUi, /Анулювати помилкову/);
  const playerBehavior = monthlyStarUi.slice(monthlyStarUi.indexOf("export function PlayerAchievementBehavior"), monthlyStarUi.indexOf("export function MonthlyStarGroupPanel"));
  assert.doesNotMatch(playerBehavior, /rpc\("void_behavior_card"|<VoidBehaviorCardAction/);
  assert.match(playerBehavior, /анулювання помилкових карток виконується у вкладці «Зірка місяця»/);

  assert.match(adminMonthlyStar, /AdminMonthlyStarResults/);
  assert.match(adminMonthlyStar, /Адміністратор переглядає результат/);
  assert.doesNotMatch(adminMonthlyStar, /MonthlyStarGroupPanel|adminMode|BehaviorCardAction|Виправити результат/);

  assert.match(scopeSql, /create or replace function public\.set_player_photo/i);
  assert.match(scopeSql, /context_type <> 'player_photo'/);
  assert.match(scopeSql, /behavior_cards_event_player_active_idx/);
  assert.match(scopeSql, /partition by card\.player_id, card\.event_id/);
  assert.match(scopeSql, /Автоматично анульовано як дубль картки тієї самої події/);
  assert.match(scopeSql, /drop policy if exists behavior_cards_admin_all/i);
  assert.match(scopeSql, /drop policy if exists monthly_star_awards_admin_all/i);
  assert.match(scopeSql, /profile\.role = 'coach'/);
  assert.match(scopeSql, /event_id is not null/);
  assert.match(trainingRulesSql, /context_type = 'player_photo'/);
  assert.match(trainingRulesSql, /context_age is null/);
  assert.match(trainingRulesSql, /BEHAVIOR_CARD_TRAINING_ONLY/);
  assert.match(trainingRulesSql, /event_row\.event_type = 'training'/);
  assert.match(policyScopeSql, /event_row\.group_id = player_behavior_cards\.group_id/);
  assert.match(photoRegistrationSql, /create or replace function public\.register_player_photo_asset/i);
  assert.match(photoRegistrationSql, /private\.has_group\(p_group_id\)/);
  assert.match(photoRegistrationSql, /p_object_path !~/);
});

test("monthly star export places two A5 awards on one A4 sheet and blocks incomplete photo sets", async () => {
  const [exporter, generator, jpeg] = await Promise.all([
    readFile(adminExportUrl, "utf8"),
    readFile(monthlyStarAwardPdfUrl, "utf8"),
    readFile(new URL("../public/champion-club-emblem.jpg", import.meta.url)),
  ]);
  assert.match(exporter, /Нагороди «Зірка місяця»/);
  assert.match(exporter, /monthly_star_awards/);
  assert.match(exporter, /\.is\("revoked_at", null\)/);
  assert.match(exporter, /player_photos/);
  assert.match(exporter, /\.eq\("is_current", true\)/);
  assert.match(exporter, /\.eq\("file_assets\.scan_status", "clean"\)/);
  assert.match(exporter, /PDF не сформовано\. Додайте фото у профілі:/);
  assert.ok(exporter.indexOf("missingPhotoAwards.length") < exporter.lastIndexOf("createMonthlyStarAwardPdf"), "all missing photos must block generation before the PDF call");
  assert.doesNotMatch(exporter, /award_type|Вибір тренера|Вибір команди/);
  for (const field of ["page.photo", "page.fullName", "page.groupCode", "page.themeTitle"]) assert.match(generator, new RegExp(field.replace(".", "\\.")));
  assert.match(generator, /ЗІРКА/);
  assert.match(generator, /МІСЯЦЯ/);
  assert.match(generator, /awardsByGroup/);
  assert.match(generator, /index \+= 2/);

  const pdf = buildA4AwardSheetsPdf([[new Uint8Array(jpeg), new Uint8Array(jpeg)]]);
  assert.equal(pdf.type, "application/pdf");
  const pdfText = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  assert.match(pdfText, /^%PDF-1\.4/);
  assert.equal((pdfText.match(/\/Type \/Page\b/g) ?? []).length, 1, "two A5 awards must share one A4 sheet");
  assert.equal((pdfText.match(/\/Subtype \/Image/g) ?? []).length, 2);
  assert.equal((pdfText.match(/\/Width 200 \/Height 200/g) ?? []).length, 2, "embedded JPEG dimensions must match the source images");
  assert.equal((pdfText.match(/\/MediaBox/g) ?? []).length, 1);
  assert.match(pdfText, new RegExp(`/MediaBox \\[0 0 ${A4_LANDSCAPE_PDF_WIDTH_PT} ${A4_LANDSCAPE_PDF_HEIGHT_PT}\\]`));
  assert.match(pdfText, /\/AwardLeft Do/);
  assert.match(pdfText, /\/AwardRight Do/);
  assert.match(pdfText, /xref[\s\S]+startxref[\s\S]+%%EOF$/);

  const singleAwardText = Buffer.from(await buildA4AwardSheetsPdf([[new Uint8Array(jpeg)]]).arrayBuffer()).toString("latin1");
  assert.equal((singleAwardText.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.doesNotMatch(singleAwardText, /\/AwardRight Do/, "an incomplete pair must leave the second A5 half empty");
});

test("coach deletion is server-only, keeps history and queues future reassignment", async () => {
  const [sql, edge, management, plan] = await Promise.all([
    readFile(coachDeletionMigrationUrl, "utf8"),
    readFile(adminUsersFunctionUrl, "utf8"),
    readFile(managementUrl, "utf8"),
    readFile(adminPlanUrl, "utf8"),
  ]);
  assert.match(sql, /drop constraint if exists profiles_id_fkey/i);
  assert.match(sql, /add column if not exists deleted_at timestamptz/i);
  assert.match(sql, /create or replace function public\.finalize_coach_deletion/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function public\.finalize_coach_deletion\(uuid, uuid, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.finalize_coach_deletion\(uuid, uuid, text\) to service_role/i);
  assert.match(sql, /set needs_substitute = true/i);
  assert.match(sql, /'coach_substitution'::public\.operational_type/i);
  assert.match(sql, /'delete_coach'/i);
  assert.doesNotMatch(sql, /delete from public\.events/i);
  assert.match(edge, /action: "create" \| "reset_password" \| "access" \| "assign_groups" \| "delete"/);
  assert.match(edge, /confirmation_name\.trim\(\) !== targetResult\.data\.full_name\.trim\(\)/);
  assert.match(edge, /service\.auth\.admin\.deleteUser\(body\.user_id, false\)/);
  assert.match(edge, /service\.rpc\("finalize_coach_deletion"/);
  assert.match(management, /Назавжди видалити тренера/);
  assert.match(management, /\.neq\("status", "closed"\)/);
  assert.match(plan, /Попереднього тренера видалено — оберіть нового/);
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
