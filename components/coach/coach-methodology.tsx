"use client";

import { groupAge, groupCode } from "@/lib/domain/seasons";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BookOpenCheck, ChevronDown, FileText, Library, Shield, Swords, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Pill, SearchField, StatusMessage, Tabs, WorkspaceHeader } from "@/components/common/workspace-ui";
import { LEVEL_LABELS, normalizedSearch } from "@/lib/domain/format";
import type { FileAsset, GroupSummary, MethodologyLevel, MethodologyPhase, MethodologySection, MethodologyTask, TerminologyEntry, TrainingStructure } from "@/lib/domain/types";
import { openPrivateFile } from "@/lib/supabase/files";

interface Props { client: SupabaseClient; groups: GroupSummary[]; }
type MethodologyTab = "terms" | "program" | "structure" | "library";

interface MaterialRow { id: string; task_id: string; age_from: number; age_to: number; file_assets?: FileAsset | FileAsset[] | null; }

export function CoachMethodology({ client, groups }: Props) {
  const [tab, setTab] = useState<MethodologyTab>("terms");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [terms, setTerms] = useState<TerminologyEntry[]>([]);
  const [tasks, setTasks] = useState<MethodologyTask[]>([]);
  const [structures, setStructures] = useState<TrainingStructure[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [sections, setSections] = useState<MethodologySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [termResult, taskResult, structureResult, materialResult, sectionResult] = await Promise.all([
      client.from("terminology_entries").select("id, term, definition, category, source, is_active").eq("is_active", true).order("term"),
      client.from("methodology_tasks").select("id, phase, level, component, title, description, age_from, age_to, sort_order, is_active").eq("is_active", true).order("sort_order"),
      client.from("training_structures").select("id, name, age_from, age_to, is_active, training_structure_steps(id, structure_id, position, duration_minutes, title, description)").eq("is_active", true).order("age_from"),
      client.from("methodology_materials").select("id, task_id, age_from, age_to, file_assets(*)"),
      client.from("methodology_sections").select("id, title, description, sort_order, is_active, methodology_section_materials(id, section_id, file_asset_id, title, description, is_active, file_assets(*))").eq("is_active", true).order("sort_order").order("title"),
    ]);
    setLoading(false);
    if (termResult.error || taskResult.error || structureResult.error || materialResult.error || sectionResult.error) { setError("Не вдалося завантажити методичну базу."); return; }
    setTerms((termResult.data ?? []) as TerminologyEntry[]);
    setTasks((taskResult.data ?? []) as MethodologyTask[]);
    setStructures((structureResult.data ?? []) as unknown as TrainingStructure[]);
    setMaterials((materialResult.data ?? []) as unknown as MaterialRow[]);
    setSections((sectionResult.data ?? []) as unknown as MethodologySection[]);
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groupId, groups]);
  const group = groups.find((item) => item.id === groupId) ?? groups[0];
  const isGoalkeeperGroup = group?.group_kind === "goalkeeper";
  const age = groupAge(group) ?? 6;

  return <div className="workspace-stack"><WorkspaceHeader eyebrow="Єдина навчальна база" title="Методика" description="Термінологія, програма занять, структура тренування й загальні матеріали" actions={groups.length ? <GroupSelect groups={groups} value={groupId} onChange={setGroupId} /> : undefined} /><Tabs label="Методичні розділи" value={tab} onChange={setTab} items={[{ value: "terms", label: "Термінологія" }, { value: "program", label: "Програма занять" }, { value: "structure", label: "Структура заняття" }, { value: "library", label: "Матеріали" }]} />{error && <StatusMessage kind="error">{error}</StatusMessage>}{loading ? <LoadingState label="Завантажуємо методику…" /> : tab === "terms" ? <TerminologyPanel terms={terms} /> : tab === "library" ? <MethodologyLibrary client={client} sections={sections} /> : isGoalkeeperGroup ? <GoalkeeperMethodologyNotice groupCode={groupCode(group)} section={tab} /> : tab === "program" ? <ProgramPanel client={client} age={age} tasks={tasks} materials={materials} /> : <StructurePanel age={age} structures={structures} />}</div>;
}

function GoalkeeperMethodologyNotice({ groupCode, section }: { groupCode: string; section: "program" | "structure" }) {
  return <EmptyState title={`${section === "program" ? "Програму" : "Структуру заняття"} для «${groupCode}» ще не наповнено`}>Воротарська група працює як окрема команда. Її методичне наповнення не змішується з віковими програмами U6–U17.</EmptyState>;
}

function TerminologyPanel({ terms }: { terms: TerminologyEntry[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = normalizedSearch(query);
    if (!needle) return terms.slice(0, 30);
    return terms.filter((entry) => normalizedSearch(`${entry.term} ${entry.definition} ${entry.category}`).includes(needle)).slice(0, 80);
  }, [query, terms]);
  return <section className="panel-section terminology-panel"><div className="section-title-row"><div><p className="eyebrow">Пошук під час набору</p><h2>Футбольні терміни</h2></div><Pill tone="plum">{terms.length} термінів</Pill></div><SearchField value={query} onChange={setQuery} placeholder="Введіть слово або його частину" label="Пошук терміна" />{filtered.length ? <div className="term-list">{filtered.map((entry) => <article key={entry.id}><div><h3>{entry.term}</h3><Pill tone="neutral">{entry.category}</Pill></div><p>{entry.definition}</p>{entry.source && <small>Джерело: {entry.source}</small>}</article>)}</div> : <EmptyState title="Відповідних термінів не знайдено">Спробуйте іншу частину слова.</EmptyState>}</section>;
}

function MethodologyLibrary({ client, sections }: { client: SupabaseClient; sections: MethodologySection[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = normalizedSearch(query);
    if (!needle) return sections;
    return sections.filter((section) => normalizedSearch(`${section.title} ${section.description ?? ""} ${(section.methodology_section_materials ?? []).map((material) => `${material.title ?? ""} ${material.description ?? ""}`).join(" ")}`).includes(needle));
  }, [query, sections]);
  return <section className="panel-section methodology-library"><div className="section-title-row"><div><p className="eyebrow">Матеріали поза програмою завдань</p><h2>Методична бібліотека</h2></div><Pill tone="plum">{sections.length} розділів</Pill></div><SearchField value={query} onChange={setQuery} placeholder="Пошук розділу або матеріалу" />{visible.length ? <div className="methodology-section-list">{visible.map((section) => <article key={section.id}><div className="methodology-library-heading"><span className="tile-icon plum"><Library /></span><div><h3>{section.title}</h3>{section.description && <p>{section.description}</p>}</div></div>{(section.methodology_section_materials ?? []).length ? <div className="file-list">{(section.methodology_section_materials ?? []).map((material) => { const assets = Array.isArray(material.file_assets) ? material.file_assets : material.file_assets ? [material.file_assets] : []; const asset = assets[0]; return asset ? <button type="button" key={material.id} onClick={() => void openPrivateFile(client, asset)}><FileText /><span><b>{material.title || asset.original_name}</b>{material.description && <small>{material.description}</small>}</span></button> : null; })}</div> : <p className="muted">У цьому розділі матеріалів ще немає.</p>}</article>)}</div> : <EmptyState title="Матеріалів не знайдено">Спробуйте інше слово або зверніться до адміністратора.</EmptyState>}</section>;
}

function ProgramPanel({ client, age, tasks, materials }: { client: SupabaseClient; age: number; tasks: MethodologyTask[]; materials: MaterialRow[] }) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<MethodologyPhase>("attack");
  const [openTask, setOpenTask] = useState<string | null>(null);
  const visible = useMemo(() => tasks.filter((task) => task.age_from <= age && task.age_to >= age && task.phase === phase && normalizedSearch(`${task.title} ${task.component ?? ""} ${task.description ?? ""}`).includes(normalizedSearch(query))), [age, phase, query, tasks]);
  const grouped = (["individual", "group", "team"] as MethodologyLevel[]).map((level) => ({ level, tasks: visible.filter((task) => task.level === level) }));
  return <section className="panel-section"><div className="phase-switch"><button type="button" className={phase === "attack" ? "active" : ""} onClick={() => setPhase("attack")}><Swords />Тактика нападу</button><button type="button" className={phase === "defence" ? "active" : ""} onClick={() => setPhase("defence")}><Shield />Тактика захисту</button></div><SearchField value={query} onChange={setQuery} placeholder="Пошук навчального завдання" />{grouped.map((section) => <section className="task-level" key={section.level}><h2>{LEVEL_LABELS[section.level]} тактика</h2>{section.tasks.length ? <div className="task-list">{section.tasks.map((task) => { const taskMaterials = materials.filter((material) => material.task_id === task.id && material.age_from <= age && material.age_to >= age).flatMap((row) => Array.isArray(row.file_assets) ? row.file_assets : row.file_assets ? [row.file_assets] : []); const open = openTask === task.id; return <article key={task.id} className={open ? "open" : ""}><button type="button" className="task-trigger" onClick={() => setOpenTask(open ? null : task.id)}><span><b>{task.title}</b>{task.component && <small>{task.component}</small>}</span><ChevronDown /></button>{open && <div className="task-content">{task.description && <p>{task.description}</p>}<h3>Методичні матеріали</h3>{taskMaterials.length ? <div className="file-list">{taskMaterials.map((asset) => <button type="button" key={asset.id} onClick={() => void openPrivateFile(client, asset)}><FileText /><span>{asset.original_name}</span></button>)}</div> : <p className="muted">Документів до завдання ще немає.</p>}</div>}</article>; })}</div> : <p className="muted">Для U{age} завдань у цьому рівні ще немає.</p>}</section>)}</section>;
}

function StructurePanel({ age, structures }: { age: number; structures: TrainingStructure[] }) {
  const structure = structures.find((item) => item.age_from <= age && item.age_to >= age);
  if (!structure) return <EmptyState title={`Структуру для U${age} ще не налаштовано`} />;
  const steps = [...(structure.training_structure_steps ?? [])].sort((a, b) => a.position - b.position);
  const total = steps.reduce((sum, step) => sum + step.duration_minutes, 0);
  return <section className="panel-section"><div className="structure-head"><span className="tile-icon gold"><BookOpenCheck /></span><div><p className="eyebrow">U{structure.age_from}–U{structure.age_to}</p><h2>{structure.name}</h2><p>Рекомендована тривалість: {total} хвилин</p></div></div>{steps.length ? <ol className="structure-steps">{steps.map((step) => <li key={step.id}><span>{step.position}</span><div><div><h3>{step.title}</h3><Pill tone="teal"><Timer size={14} />{step.duration_minutes} хв</Pill></div>{step.description && <p>{step.description}</p>}</div></li>)}</ol> : <EmptyState title="Частини заняття ще не додано" />}</section>;
}
