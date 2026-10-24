"use client";

import Image from "next/image";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarChart3, BookOpen, CalendarDays, Download, LogOut, MapPinned, PackageOpen, Settings2, Shirt, Users } from "lucide-react";
import { VenueOccupancy } from "@/components/admin/venue-occupancy";
import { useCallback, useEffect, useState } from "react";
import { AdminExport } from "@/components/admin/admin-export";
import { AdminGroups } from "@/components/admin/admin-groups";
import { AdminManagement } from "@/components/admin/admin-management";
import { AdminPlan, AdminReport } from "@/components/admin/admin-plan";
import { AdminUniform } from "@/components/admin/admin-uniform";
import { CoachInventory } from "@/components/coach/coach-inventory";
import { CoachMethodology } from "@/components/coach/coach-methodology";
import { CoachPlan } from "@/components/coach/coach-plan";
import { CoachPlayers } from "@/components/coach/coach-players";
import { SessionTimeoutGuard } from "@/components/auth/session-timeout-guard";
import { ConnectionStatus } from "@/components/common/connection-status";
import { LoadingState, StatusMessage } from "@/components/common/workspace-ui";
import type { GroupSummary, Profile } from "@/lib/domain/types";

interface Props { client: SupabaseClient; profile: Profile; onMfaRequired?: () => void; }
type CoachView = "plan" | "players" | "methodology" | "inventory";
type AdminView = "plan" | "groups" | "uniform" | "management" | "report" | "export" | "venues";
type View = CoachView | AdminView;

const coachNavigation: Array<{ value: CoachView; label: string; icon: typeof CalendarDays }> = [
  { value: "plan", label: "План", icon: CalendarDays },
  { value: "players", label: "Гравці", icon: Users },
  { value: "methodology", label: "Методика", icon: BookOpen },
  { value: "inventory", label: "Інвентар", icon: PackageOpen },
];

const adminNavigation: Array<{ value: AdminView; label: string; icon: typeof CalendarDays }> = [
  { value: "plan", label: "План", icon: CalendarDays },
  { value: "groups", label: "Групи", icon: Users },
  { value: "venues", label: "Майданчики", icon: MapPinned },
  { value: "uniform", label: "Форма", icon: Shirt },
  { value: "management", label: "Керування", icon: Settings2 },
  { value: "report", label: "Загальний звіт", icon: BarChart3 },
  { value: "export", label: "Експорт", icon: Download },
];

export function AppShell({ client, profile, onMfaRequired }: Props) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activeView, setActiveView] = useState<View>("plan");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigation = profile.role === "admin" ? adminNavigation : coachNavigation;

  useEffect(() => {
    const saved = window.sessionStorage.getItem(`champion:active-view:${profile.id}`);
    if (saved && navigation.some((item) => item.value === saved)) setActiveView(saved as View);
  }, [navigation, profile.id]);

  const loadGroups = useCallback(async () => {
    setLoading(true); setLoadError(null);
    const fetchGroups = () => client.from("groups").select("id, code, age, team_suffix, group_kind, competition_format, regulation_source, regulation_verified_on, season, cohort_birth_year, display_age, display_code").eq("is_active", true).order("group_kind").order("age", { nullsFirst: false }).order("team_suffix");
    if (profile.role === "admin") {
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error) {
        setLoading(false);
        setLoadError("Захищену сесію не оновлено. Увійдіть ще раз і повторіть дію.");
        return;
      }
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data?.currentLevel !== "aal2") {
        setLoading(false);
        onMfaRequired?.();
        return;
      }
    }
    const result = await fetchGroups();
    if (result.error) {
      setLoading(false);
      setLoadError("Не вдалося завантажити групи. Оновіть захищену сесію або повторіть спробу.");
      return;
    }
    if (profile.role === "admin" && !(result.data ?? []).length) {
      setLoading(false);
      setLoadError("У staging налаштовано групи, але поточна сесія не надала до них доступ. Повторіть завантаження.");
      return;
    }
    setLoading(false);
    setGroups((result.data ?? []) as GroupSummary[]);
  }, [client, onMfaRequired, profile.role]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);

  function selectView(value: View) {
    window.sessionStorage.setItem(`champion:active-view:${profile.id}`, value);
    setActiveView(value);
  }

  function renderView() {
    if (loading) return <LoadingState label="Завантажуємо робочий простір…" />;
    if (loadError) return <section className="panel-section"><StatusMessage kind="error">{loadError}</StatusMessage><button className="secondary-action retry-action" type="button" onClick={() => void loadGroups()}>Повторити завантаження</button></section>;
    if (profile.role === "coach") {
      if (activeView === "players") return <CoachPlayers client={client} profile={profile} groups={groups} />;
      if (activeView === "methodology") return <CoachMethodology client={client} groups={groups} />;
      if (activeView === "inventory") return <CoachInventory client={client} profile={profile} groups={groups} />;
      return <CoachPlan client={client} profile={profile} groups={groups} />;
    }
    if (activeView === "groups") return <AdminGroups client={client} profile={profile} groups={groups} onRefresh={() => void loadGroups()} />;
    if (activeView === "venues") return <VenueOccupancy client={client} />;
    if (activeView === "uniform") return <AdminUniform client={client} profile={profile} groups={groups} />;
    if (activeView === "management") return <AdminManagement client={client} profile={profile} groups={groups} onMfaRequired={onMfaRequired} />;
    if (activeView === "report") return <AdminReport client={client} />;
    if (activeView === "export") return <AdminExport client={client} profile={profile} groups={groups} />;
    return <AdminPlan client={client} />;
  }

  return <div className="app-frame"><SessionTimeoutGuard client={client} profileId={profile.id} /><header className="app-header"><div className="header-inner"><div className="app-brand"><span className="brand-mark"><Image src="/champion-club-emblem.jpg" alt="" width={48} height={48} priority /></span><strong>ЧЕМПІОН</strong></div><div className="account-area"><span><b>{profile.full_name}</b><small>{profile.role === "admin" ? "Адміністратор" : "Тренер"}</small></span><button className="icon-button" type="button" onClick={() => void client.auth.signOut()} aria-label="Вийти"><LogOut size={19} /></button></div></div></header><main className="app-main"><nav className="app-nav" aria-label="Основна навігація">{navigation.map(({ value, label, icon: Icon }) => <button key={value} className={activeView === value ? "active" : ""} type="button" onClick={() => selectView(value)}><Icon size={18} /><span>{label}</span></button>)}</nav><ConnectionStatus client={client} profileId={profile.id} />{renderView()}</main></div>;
}
