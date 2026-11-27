"use client";

import Image from "next/image";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarChart3, BookOpen, CalendarDays, Download, LogOut, MapPinned, PackageOpen, Settings2, Shirt, Users } from "lucide-react";
import { VenueOccupancy } from "@/components/admin/venue-occupancy";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
import { mergeCreatedGroup } from "@/lib/domain/group-creation";
import { GROUP_SUMMARY_SELECT, orderLocationGroups } from "@/lib/domain/location-groups";
import { useAutomaticRefresh } from "@/lib/browser/use-automatic-refresh";
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
  const workspaceScroll = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const groupRequest = useRef(0);
  const navigation = profile.role === "admin" ? adminNavigation : coachNavigation;
  const workspaceKey = profile.role === "coach" ? groups.map((group) => group.id).sort().join(",") : "admin";

  useEffect(() => {
    const saved = window.sessionStorage.getItem(`champion:active-view:${profile.id}`);
    if (saved && navigation.some((item) => item.value === saved)) setActiveView(saved as View);
  }, [navigation, profile.id]);

  const loadGroups = useCallback(async (silent = false) => {
    const ticket = ++groupRequest.current;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      if (profile.role === "admin") {
        const refreshed = await client.auth.refreshSession();
        if (ticket !== groupRequest.current) return;
        if (refreshed.error) {
          setLoadError("Захищену сесію не оновлено. Увійдіть ще раз і повторіть дію.");
          return;
        }
        const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (ticket !== groupRequest.current) return;
        if (assurance.error || assurance.data?.currentLevel !== "aal2") {
          onMfaRequired?.();
          return;
        }
      }
      const result = await client.from("groups").select(GROUP_SUMMARY_SELECT).eq("is_active", true).order("group_kind").order("age", { nullsFirst: false }).order("team_suffix");
      if (ticket !== groupRequest.current) return;
      if (result.error) {
        setLoadError("Не вдалося завантажити групи. Оновіть захищену сесію або повторіть спробу.");
        return;
      }
      if (profile.role === "admin" && !(result.data ?? []).length) {
        setLoadError("У staging налаштовано групи, але поточна сесія не надала до них доступ. Повторіть завантаження.");
        return;
      }
      const next = orderLocationGroups((result.data ?? []) as unknown as GroupSummary[]);
      setGroups((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    } catch {
      if (ticket === groupRequest.current) setLoadError("Не вдалося оновити групи. Перевірте з’єднання й повторіть спробу.");
    } finally {
      if (ticket === groupRequest.current) setLoading(false);
    }
  }, [client, onMfaRequired, profile.id, profile.role]);
  const refreshGroups = useCallback(() => loadGroups(true), [loadGroups]);
  useAutomaticRefresh(refreshGroups, profile.role === "coach");
  useEffect(() => {
    void loadGroups();
    const requests = groupRequest;
    return () => { requests.current++; };
  }, [loadGroups]);

  function selectView(value: View) {
    window.sessionStorage.setItem(`champion:active-view:${profile.id}`, value);
    if (workspaceScroll.current) workspaceScroll.current.scrollTop = 0;
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
    if (activeView === "groups") return <AdminGroups client={client} profile={profile} groups={groups} onRefresh={() => void loadGroups(true)} />;
    if (activeView === "venues") return <VenueOccupancy client={client} />;
    if (activeView === "uniform") return <AdminUniform client={client} profile={profile} groups={groups} />;
    if (activeView === "management") return <AdminManagement client={client} profile={profile} groups={groups} onGroupCreated={(created) => setGroups((current) => mergeCreatedGroup(current, created))} onMfaRequired={onMfaRequired} />;
    if (activeView === "report") return <AdminReport client={client} groups={groups} />;
    if (activeView === "export") return <AdminExport client={client} profile={profile} groups={groups} />;
    return <AdminPlan client={client} groups={groups} />;
  }

  return <div className="app-frame"><SessionTimeoutGuard client={client} profileId={profile.id} /><header className="app-header"><div className="header-inner"><div className="app-brand"><span className="brand-mark"><Image src="/champion-club-emblem.jpg" alt="" width={48} height={48} priority /></span><strong>ЧЕМПІОН</strong></div><div className="account-area"><span><b>{profile.full_name}</b><small>{profile.role === "admin" ? "Адміністратор" : "Тренер"}</small></span><button className="icon-button" type="button" onClick={() => void client.auth.signOut()} aria-label="Вийти"><LogOut size={19} /></button></div></div></header><main ref={workspaceScroll} className="workspace-scroll-area" data-workspace-scroll="" tabIndex={0} aria-label="Робочий простір"><div className="app-main"><nav className="app-nav" aria-label="Основна навігація">{navigation.map(({ value, label, icon: Icon }) => <button key={value} className={activeView === value ? "active" : ""} type="button" onClick={() => selectView(value)}><Icon size={18} /><span>{label}</span></button>)}</nav><ConnectionStatus client={client} profileId={profile.id} /><Fragment key={workspaceKey}>{renderView()}</Fragment></div></main></div>;
}
