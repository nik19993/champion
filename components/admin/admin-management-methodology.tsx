"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FileText, FileUp, FolderPlus, Library, Pencil, Plus } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  SearchField,
  StatusMessage,
} from "@/components/common/workspace-ui";
import { EnhancedImportManagement } from "@/components/admin/import-management";
import { EnhancedProgramManagement } from "@/components/admin/program-management";
import { EnhancedStructureManagement } from "@/components/admin/structure-management";
import { safeError } from "@/lib/domain/format";
import type {
  FileAsset,
  GroupSummary,
  MethodologySection,
  MethodologySectionMaterial,
  MethodologyTask,
  Profile,
  TerminologyEntry,
} from "@/lib/domain/types";
import { openPrivateFile, uploadPrivateFile } from "@/lib/supabase/files";

const terminologyCategories = [
  "Індивідуальна тактика нападу",
  "Групова тактика нападу",
  "Командна тактика нападу",
  "Індивідуальна тактика захисту",
  "Групова тактика захисту",
  "Командна тактика захисту",
  "Стандартні положення в нападі",
  "Стандартні положення в захисті",
  "Загальні поняття",
];

type Section =
  | "announcements"
  | "users"
  | "inventory"
  | "venues"
  | "evaluation"
  | "program"
  | "structure"
  | "terms"
  | "materials"
  | "imports";

interface Props {
  client: SupabaseClient;
  profile: Profile;
  groups: GroupSummary[];
  open: Section | null;
  onOpen: (section: Section) => void;
}

export function MethodologyManagement({
  client,
  profile,
  groups,
  open,
  onOpen,
}: Props) {
  return (
    <>
      <Accordion
        title="Програма занять"
        open={open === "program"}
        onToggle={() => onOpen("program")}
      >
        <EnhancedProgramManagement client={client} profile={profile} />
      </Accordion>
      <Accordion
        title="Структура заняття"
        open={open === "structure"}
        onToggle={() => onOpen("structure")}
      >
        <EnhancedStructureManagement client={client} profile={profile} />
      </Accordion>
      <Accordion
        title="Термінологія"
        open={open === "terms"}
        onToggle={() => onOpen("terms")}
      >
        <TerminologyManagement client={client} profile={profile} />
      </Accordion>
      <Accordion
        title="Методичні матеріали"
        open={open === "materials"}
        onToggle={() => onOpen("materials")}
      >
        <MaterialsManagement client={client} profile={profile} />
      </Accordion>
      <Accordion
        title="Пакетний імпорт"
        open={open === "imports"}
        onToggle={() => onOpen("imports")}
      >
        <EnhancedImportManagement client={client} profile={profile} groups={groups} />
      </Accordion>
    </>
  );
}

function TerminologyManagement({
  client,
  profile,
}: {
  client: SupabaseClient;
  profile: Profile;
}) {
  const [terms, setTerms] = useState<TerminologyEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [category, setCategory] = useState("Індивідуальна тактика нападу");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const result = await client
      .from("terminology_entries")
      .select("id, term, definition, category, source, is_active")
      .order("term");
    if (result.error) {
      setMessage({ kind: "error", text: "Словник не завантажено." });
      return;
    }
    setTerms((result.data ?? []) as TerminologyEntry[]);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setTerm("");
    setDefinition("");
    setCategory("Індивідуальна тактика нападу");
    setSource("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const payload = {
      term: term.trim(),
      definition: definition.trim(),
      category,
      source: source.trim() || null,
      updated_by: profile.id,
    };
    const result = editingId
      ? await client.from("terminology_entries").update(payload).eq("id", editingId)
      : await client.from("terminology_entries").upsert(
          {
            ...payload,
            is_active: true,
            created_by: profile.id,
          },
          { onConflict: "term,category" },
        );
    setBusy(false);
    if (result.error) {
      setMessage({
        kind: "error",
        text: result.error.code === "23505"
          ? "Термін із такою назвою вже є в цій категорії."
          : "Термін не збережено.",
      });
      return;
    }
    setMessage({
      kind: "success",
      text: editingId ? "Зміни терміна збережено." : "Термін додано.",
    });
    resetForm();
    await load();
  }

  function edit(entry: TerminologyEntry) {
    setEditingId(entry.id);
    setTerm(entry.term);
    setDefinition(entry.definition);
    setCategory(entry.category);
    setSource(entry.source ?? "");
    setMessage(null);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function toggle(entry: TerminologyEntry) {
    const result = await client
      .from("terminology_entries")
      .update({ is_active: !entry.is_active, updated_by: profile.id })
      .eq("id", entry.id);
    if (result.error) {
      setMessage({ kind: "error", text: "Стан терміна не змінено." });
      return;
    }
    await load();
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk-UA");
    return terms
      .filter(
        (entry) =>
          !needle ||
          `${entry.term} ${entry.definition} ${entry.category}`
            .toLocaleLowerCase("uk-UA")
            .includes(needle),
      )
      .slice(0, 100);
  }, [query, terms]);

  const categoryOptions = useMemo(
    () => [...new Set([...terminologyCategories, ...terms.map((entry) => entry.category)])]
      .sort((left, right) => left.localeCompare(right, "uk-UA")),
    [terms],
  );

  return (
    <div className="management-grid">
      <form ref={formRef} className="form-stack management-form" onSubmit={save}>
        <h3>{editingId ? "Редагування терміна" : "Новий термін"}</h3>
        <label>
          <span>Термін</span>
          <input value={term} onChange={(event) => setTerm(event.target.value)} required />
        </label>
        <label>
          <span>Визначення</span>
          <textarea
            rows={4}
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Категорія</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categoryOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Джерело</span>
          <input value={source} onChange={(event) => setSource(event.target.value)} />
        </label>
        {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
        <div className="inline-actions">
          <button className="primary-action" disabled={busy}>
            {editingId ? <Library size={18} /> : <Plus size={18} />}
            {busy ? "Збереження…" : editingId ? "Зберегти зміни" : "Додати термін"}
          </button>
          {editingId && (
            <button className="secondary-action" type="button" onClick={resetForm}>
              Скасувати
            </button>
          )}
        </div>
      </form>
      <div>
        <SearchField value={query} onChange={setQuery} placeholder="Пошук у словнику" />
        <div className="compact-list term-admin-list">
          {visible.map((entry) => (
            <article key={entry.id}>
              <div>
                <b>{entry.term}</b>
                <small>
                  {entry.category}
                  {!entry.is_active ? " · Неактивний" : ""}
                </small>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="secondary-action small"
                  onClick={() => edit(entry)}
                >
                  <Pencil size={15} />
                  Редагувати
                </button>
                <button
                  type="button"
                  className="secondary-action small"
                  onClick={() => void toggle(entry)}
                >
                  {entry.is_active ? "Деактивувати" : "Активувати"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaterialsManagement({
  client,
  profile,
}: {
  client: SupabaseClient;
  profile: Profile;
}) {
  const [tasks, setTasks] = useState<MethodologyTask[]>([]);
  const [sections, setSections] = useState<MethodologySection[]>([]);
  const [mode, setMode] = useState<"library" | "task">("library");
  const [taskId, setTaskId] = useState("");
  const [ageFrom, setAgeFrom] = useState(6);
  const [ageTo, setAgeTo] = useState(15);
  const [taskFile, setTaskFile] = useState<File | null>(null);
  const [sectionFile, setSectionFile] = useState<File | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [sectionSortOrder, setSectionSortOrder] = useState(0);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const [taskResult, sectionResult] = await Promise.all([
      client
        .from("methodology_tasks")
        .select("id, phase, level, component, title, description, age_from, age_to, sort_order, is_active")
        .eq("is_active", true)
        .order("title"),
      client
        .from("methodology_sections")
        .select("id, title, description, sort_order, is_active, methodology_section_materials(id, section_id, file_asset_id, title, description, is_active, file_assets(*))")
        .order("sort_order")
        .order("title"),
    ]);
    if (taskResult.error || sectionResult.error) {
      setMessage({ kind: "error", text: "Методичні матеріали не завантажено." });
      return;
    }
    const taskRows = (taskResult.data ?? []) as MethodologyTask[];
    const sectionRows = (sectionResult.data ?? []) as unknown as MethodologySection[];
    setTasks(taskRows);
    setSections(sectionRows);
    setTaskId((current) => taskRows.some((task) => task.id === current) ? current : (taskRows[0]?.id ?? ""));
    setSectionId((current) => sectionRows.some((section) => section.id === current && section.is_active) ? current : (sectionRows.find((section) => section.is_active)?.id ?? ""));
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  async function submitTaskMaterial(event: FormEvent) {
    event.preventDefault();
    if (!taskFile || !taskId) return;
    if (ageFrom > ageTo) {
      setMessage({ kind: "error", text: "Початковий вік не може бути більшим за кінцевий." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const asset = await uploadPrivateFile(client, taskFile, {
        bucket: "methodology",
        ownerId: profile.id,
        age: ageFrom,
        contextType: "methodology_material",
      });
      const result = await client.from("methodology_materials").insert({
        task_id: taskId,
        age_from: ageFrom,
        age_to: ageTo,
        file_asset_id: asset.id,
        added_by: profile.id,
      });
      if (result.error) throw result.error;
      setTaskFile(null);
      setFileInputKey((value) => value + 1);
      setMessage({ kind: "success", text: "Матеріал додано до навчального завдання." });
    } catch (error) {
      setMessage({ kind: "error", text: safeError(error, "Матеріал не завантажено.") });
    } finally {
      setBusy(false);
    }
  }

  function resetSectionForm() {
    setEditingSectionId(null);
    setSectionTitle("");
    setSectionDescription("");
    setSectionSortOrder(0);
  }

  function editSection(section: MethodologySection) {
    setEditingSectionId(section.id);
    setSectionTitle(section.title);
    setSectionDescription(section.description ?? "");
    setSectionSortOrder(section.sort_order);
    setMessage(null);
  }

  async function saveSection(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const values = {
      title: sectionTitle.trim(),
      description: sectionDescription.trim() || null,
      sort_order: sectionSortOrder,
      updated_by: profile.id,
    };
    const result = editingSectionId
      ? await client.from("methodology_sections").update(values).eq("id", editingSectionId)
      : await client.from("methodology_sections").insert({ ...values, is_active: true, created_by: profile.id });
    setBusy(false);
    if (result.error) {
      setMessage({ kind: "error", text: result.error.code === "23505" ? "Розділ із такою назвою вже існує." : "Розділ не збережено." });
      return;
    }
    setMessage({ kind: "success", text: editingSectionId ? "Зміни розділу збережено." : "Новий методичний розділ створено." });
    resetSectionForm();
    await load();
  }

  async function toggleSection(section: MethodologySection) {
    const result = await client.from("methodology_sections").update({ is_active: !section.is_active, updated_by: profile.id }).eq("id", section.id);
    if (result.error) {
      setMessage({ kind: "error", text: "Стан розділу не змінено." });
      return;
    }
    setMessage({ kind: "success", text: section.is_active ? "Розділ приховано від тренерів." : "Розділ знову доступний тренерам." });
    await load();
  }

  async function submitSectionMaterial(event: FormEvent) {
    event.preventDefault();
    if (!sectionFile || !sectionId) return;
    setBusy(true);
    setMessage(null);
    let uploaded: FileAsset | null = null;
    try {
      uploaded = await uploadPrivateFile(client, sectionFile, {
        bucket: "methodology",
        ownerId: profile.id,
        contextType: "methodology_section_material",
      });
      const result = await client.from("methodology_section_materials").insert({
        section_id: sectionId,
        file_asset_id: uploaded.id,
        title: materialTitle.trim() || sectionFile.name,
        description: materialDescription.trim() || null,
        is_active: true,
        added_by: profile.id,
      });
      if (result.error) throw result.error;
      setSectionFile(null);
      setMaterialTitle("");
      setMaterialDescription("");
      setFileInputKey((value) => value + 1);
      setMessage({ kind: "success", text: "Матеріал додано до обраного розділу." });
      await load();
    } catch (error) {
      if (uploaded) {
        await client.storage.from(uploaded.bucket).remove([uploaded.object_path]);
        await client.from("file_assets").delete().eq("id", uploaded.id);
      }
      setMessage({ kind: "error", text: safeError(error, "Матеріал не завантажено.") });
    } finally {
      setBusy(false);
    }
  }

  async function toggleMaterial(material: MethodologySectionMaterial) {
    const result = await client.from("methodology_section_materials").update({ is_active: !material.is_active }).eq("id", material.id);
    if (result.error) {
      setMessage({ kind: "error", text: "Стан матеріалу не змінено." });
      return;
    }
    await load();
  }

  function materialAsset(material: MethodologySectionMaterial) {
    const assets = Array.isArray(material.file_assets) ? material.file_assets : material.file_assets ? [material.file_assets] : [];
    return assets[0];
  }

  return (
    <div className="methodology-materials-admin">
      <div className="phase-switch" role="tablist" aria-label="Тип методичних матеріалів">
        <button type="button" className={mode === "library" ? "active" : ""} onClick={() => setMode("library")}><Library />Загальна бібліотека</button>
        <button type="button" className={mode === "task" ? "active" : ""} onClick={() => setMode("task")}><FileText />До завдань</button>
      </div>
      {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}

      {mode === "task" ? (
        <form className="form-stack management-form narrow-form" onSubmit={submitTaskMaterial}>
          <h3>Додати документ до навчального завдання</h3>
          <label><span>Навчальне завдання</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
          <div className="inline-fields">
            <label><span>Від U</span><input type="number" min={6} max={15} value={ageFrom} onChange={(event) => setAgeFrom(Number(event.target.value))} /></label>
            <label><span>До U</span><input type="number" min={6} max={15} value={ageTo} onChange={(event) => setAgeTo(Number(event.target.value))} /></label>
          </div>
          <label><span>PDF або інший дозволений документ</span><input key={`task-${fileInputKey}`} type="file" accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp" onChange={(event) => setTaskFile(event.target.files?.[0] ?? null)} required /></label>
          <button className="primary-action" disabled={busy || !taskId}><FileUp size={18} />{busy ? "Перевірка й завантаження…" : "Додати матеріал"}</button>
        </form>
      ) : (
        <>
          <p className="muted">Створюйте власні розділи для регламентів, концепцій, презентацій та інших матеріалів, які не прив’язані до окремого тренувального завдання.</p>
          <div className="management-grid">
            <form className="form-stack management-form" onSubmit={saveSection}>
              <h3>{editingSectionId ? "Редагування розділу" : "Новий розділ"}</h3>
              <label><span>Назва розділу</span><input value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} required /></label>
              <label><span>Короткий опис</span><textarea rows={3} value={sectionDescription} onChange={(event) => setSectionDescription(event.target.value)} /></label>
              <label><span>Порядок</span><input type="number" min={0} value={sectionSortOrder} onChange={(event) => setSectionSortOrder(Number(event.target.value))} /></label>
              <div className="inline-actions">
                <button className="primary-action" disabled={busy}><FolderPlus size={18} />{busy ? "Збереження…" : editingSectionId ? "Зберегти зміни" : "Створити розділ"}</button>
                {editingSectionId && <button type="button" className="secondary-action" onClick={resetSectionForm}>Скасувати</button>}
              </div>
            </form>
            <form className="form-stack management-form" onSubmit={submitSectionMaterial}>
              <h3>Додати матеріал у розділ</h3>
              <label><span>Розділ</span><select value={sectionId} onChange={(event) => setSectionId(event.target.value)} required><option value="">Оберіть розділ</option>{sections.filter((section) => section.is_active).map((section) => <option value={section.id} key={section.id}>{section.title}</option>)}</select></label>
              <label><span>Назва матеріалу</span><input value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} placeholder="Якщо порожньо — буде назва файла" /></label>
              <label><span>Опис</span><textarea rows={3} value={materialDescription} onChange={(event) => setMaterialDescription(event.target.value)} /></label>
              <label><span>Файл</span><input key={`section-${fileInputKey}`} type="file" accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp" onChange={(event) => setSectionFile(event.target.files?.[0] ?? null)} required /></label>
              <button className="primary-action" disabled={busy || !sectionId || !sectionFile}><FileUp size={18} />{busy ? "Перевірка й завантаження…" : "Додати матеріал"}</button>
            </form>
          </div>
          <div className="methodology-section-list">
            {sections.map((section) => (
              <article className="panel-section" key={section.id}>
                <div className="section-title-row">
                  <div><h3>{section.title}</h3>{section.description && <p>{section.description}</p>}<small>{section.is_active ? "Доступний тренерам" : "Прихований від тренерів"}</small></div>
                  <div className="inline-actions"><button type="button" className="secondary-action small" onClick={() => editSection(section)}><Pencil size={15} />Редагувати</button><button type="button" className="secondary-action small" onClick={() => void toggleSection(section)}>{section.is_active ? "Приховати" : "Показати"}</button></div>
                </div>
                {(section.methodology_section_materials ?? []).length ? <div className="file-list">{(section.methodology_section_materials ?? []).map((material) => { const asset = materialAsset(material); return <div className="methodology-material-row" key={material.id}><button type="button" disabled={!asset} onClick={() => asset && void openPrivateFile(client, asset)}><FileText /><span><b>{material.title || asset?.original_name || "Матеріал"}</b>{material.description && <small>{material.description}</small>}</span></button><button type="button" className="secondary-action small" onClick={() => void toggleMaterial(material)}>{material.is_active ? "Приховати" : "Показати"}</button></div>; })}</div> : <p className="muted">У цьому розділі матеріалів ще немає.</p>}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
