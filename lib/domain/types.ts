export type AppRole = "coach" | "admin";
export type ProfileStatus = "invited" | "active" | "suspended" | "closed";
export type PaymentStatus = "paid" | "unpaid";
export type EventType = "training" | "oblast" | "ukraine" | "tournament" | "theory";
export type OperationalStatus = "todo" | "in_progress" | "done";
export type OperationalType = "conflict" | "organizational_need" | "coach_substitution" | "reschedule" | "comment";
export type UniformStatus = "not_ordered" | "requested" | "preparing" | "issued";
export type MethodologyPhase = "attack" | "defence";
export type MethodologyLevel = "individual" | "group" | "team";
export type GroupKind = "age" | "goalkeeper";
export type BehaviorCardReason = "late" | "discipline_violation" | "coach_noncompliance" | "safety" | "unsporting_behavior" | "disrespect" | "other";
export type MonthlyStarAwardType = "coach_choice" | "team_choice";

export interface Profile {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  email?: string | null;
  role: AppRole;
  status: ProfileStatus;
  must_change_password?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
}

export interface GroupSummary {
  id: string;
  code: string;
  age: number | null;
  team_suffix?: "A" | "B" | "C" | null;
  group_kind: GroupKind;
  competition_format?: string | null;
  regulation_source?: string | null;
  regulation_verified_on?: string | null;
}

export interface Venue {
  id: string;
  name: string;
  venue_type: string;
  is_active: boolean;
}

export interface Player {
  id: string;
  group_id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  birth_date?: string | null;
  birth_year?: number | null;
  position?: string | null;
  dominant_foot?: string | null;
  coach_note?: string | null;
  coach_note_author_id?: string | null;
  coach_note_author_name?: string | null;
  coach_note_updated_at?: string | null;
  is_active: boolean;
  groups?: { code: string } | null;
}

export interface Guardian {
  id: string;
  player_id: string;
  full_name?: string | null;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface EventItem {
  id: string;
  group_id: string;
  event_type: EventType;
  start_at: string;
  duration_minutes: number;
  venue_id?: string | null;
  task_id?: string | null;
  coach_id: string;
  title?: string | null;
  notes?: string | null;
  organizational_need?: string | null;
  coach_comment?: string | null;
  needs_substitute?: boolean;
  substitute_coach_id?: string | null;
  original_start_at?: string | null;
  is_rescheduled?: boolean;
  status: "scheduled" | "cancelled" | "completed";
  groups?: { code: string; age?: number | null; group_kind?: GroupKind } | null;
  venues?: { name: string } | null;
  methodology_tasks?: { title: string } | null;
  attendance_sessions?: { id: string; completed_at?: string | null } | Array<{ id: string; completed_at?: string | null }> | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at?: string | null;
  require_acknowledgement: boolean;
  announcement_reads?: Array<{ read_at: string }> | null;
}

export interface MonthlyStarTheme {
  id: string;
  month: string;
  title: string;
  description: string;
  criteria?: string | null;
}

export interface PlayerBehaviorCard {
  id: string;
  player_id: string;
  group_id: string;
  coach_id?: string | null;
  coach_name_snapshot: string;
  event_id?: string | null;
  occurred_on: string;
  month: string;
  reason: BehaviorCardReason;
  comment?: string | null;
  is_voided: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface ParentContactAction {
  id: string;
  player_id: string;
  group_id: string;
  month: string;
  coach_id?: string | null;
  coach_name_snapshot: string;
  contacted_at: string;
  comment?: string | null;
}

export interface MonthlyStarAward {
  id: string;
  month: string;
  group_id: string;
  theme_id: string;
  award_type: MonthlyStarAwardType;
  player_id: string;
  correction_note?: string | null;
  revoked_at?: string | null;
  monthly_star_themes?: MonthlyStarTheme | MonthlyStarTheme[] | null;
}

export interface MethodologyTask {
  id: string;
  phase: MethodologyPhase;
  level: MethodologyLevel;
  component?: string | null;
  title: string;
  description?: string | null;
  age_from: number;
  age_to: number;
  sort_order: number;
  is_active: boolean;
}

export interface TerminologyEntry {
  id: string;
  term: string;
  definition: string;
  category: string;
  source?: string | null;
  is_active: boolean;
}

export interface MethodologySectionMaterial {
  id: string;
  section_id: string;
  file_asset_id: string;
  title?: string | null;
  description?: string | null;
  is_active: boolean;
  file_assets?: FileAsset | FileAsset[] | null;
}

export interface MethodologySection {
  id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  methodology_section_materials?: MethodologySectionMaterial[];
}

export interface TrainingStructure {
  id: string;
  name: string;
  age_from: number;
  age_to: number;
  is_active: boolean;
  training_structure_steps?: TrainingStructureStep[];
}

export interface TrainingStructureStep {
  id: string;
  structure_id: string;
  position: number;
  duration_minutes: number;
  title: string;
  description?: string | null;
}

export interface InventoryItem {
  id: string;
  group_id: string;
  name: string;
  quantity: number;
  damaged: number;
  lost: number;
  needed: number;
  is_active: boolean;
}

export interface InventoryPermission {
  id?: string;
  coach_id: string;
  group_id: string;
  can_edit_quantity: boolean;
  can_report_issues: boolean;
}

export interface OperationalItem {
  id: string;
  group_id: string;
  event_id?: string | null;
  item_type: OperationalType;
  status: OperationalStatus;
  title: string;
  comment?: string | null;
  due_at?: string | null;
  created_at: string;
  groups?: { code: string } | null;
  events?: { start_at: string; event_type: EventType } | null;
}

export interface UniformCatalogItem {
  id: string;
  name: string;
  sizes: string[];
  sort_order?: number;
  is_active: boolean;
}

export interface UniformRequest {
  id: string;
  player_id: string;
  number?: number | null;
  surname_print?: string | null;
  status: UniformStatus;
  admin_note?: string | null;
  players?: Player | null;
  uniform_request_items?: UniformRequestItem[];
}

export interface UniformRequestItem {
  id?: string;
  request_id?: string;
  catalog_item_id: string;
  size: string;
  quantity: number;
  uniform_catalog_items?: UniformCatalogItem | null;
}

export interface FileAsset {
  id: string;
  bucket: string;
  object_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  scan_status: "pending" | "clean" | "rejected";
  context_group_id?: string | null;
  context_age?: number | null;
}
