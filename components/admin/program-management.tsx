"use client";
import { BulkContentActions } from "@/components/admin/bulk-content-actions";
import { readContentRows } from "@/lib/domain/content-batch";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, ListChecks, Pencil, RotateCcw } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  SearchField,
  StatusMessage,
} from "@/components/common/workspace-ui";
import { LEVEL_LABELS, PHASE_LABELS } from "@/lib/domain/format";
import { MAX_AGE_GROUP } from "@/lib/domain/age-groups";
import type {
  MethodologyLevel,
  MethodologyPhase,
  MethodologyTask,
  Profile,
} from "@/lib/domain/types";

interface Props {
  client: SupabaseClient;
  profile: Profile;
}

const emptyForm = {
  phase: "attack" as MethodologyPhase,
  level: "individual" as MethodologyLevel,
  title: "",
  component: "",
  description: "",
  ageFrom: 6,
  ageTo: MAX_AGE_GROUP,
};

export function EnhancedProgramManagement({ client, profile }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [tasks, setTasks] = useState<MethodologyTask[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await readContentRows<MethodologyTask>(client, "tasks");
      setTasks(rows.sort((a,b) => a.phase.localeCompare(b.phase) || a.level.localeCompare(b.level) || a.sort_order-b.sort_order || a.title.localeCompare(b.title,"uk")));
      setSelected([]);
    } catch { setMessage({ kind: "error", text: "Програму занять не завантажено повністю. Оновіть перелік." }); }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function edit(task: MethodologyTask) {
    setEditingId(task.id);
    setForm({
      phase: task.phase,
      level: task.level,
      title: task.title,
      component: task.component ?? "",
      description: task.description ?? "",
      ageFrom: task.age_from,
      ageTo: task.age_to,
    });
    setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (form.ageFrom > form.ageTo) {
      setMessage({ kind: "error", text: "Початковий вік не може бути більшим за кінцевий." });
      return;
    }

    const payload = {
      phase: form.phase,
      level: form.level,
      component: form.component.trim() || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      age_from: form.ageFrom,
      age_to: form.ageTo,
      updated_by: profile.id,
    };

    const result = editingId
      ? await client.from("methodology_tasks").update(payload).eq("id", editingId)
      : await client.from("methodology_tasks").insert({
          ...payload,
          sort_order:
            Math.max(
              0,
              ...tasks
                .filter(
                  (task) => task.phase === form.phase && task.level === form.level,
                )
                .map((task) => task.sort_order),
            ) + 1,
          is_active: true,
          created_by: profile.id,
        });

    if (result.error) {
      setMessage({ kind: "error", text: "Навчальне завдання не збережено." });
      return;
    }

    setMessage({
      kind: "success",
      text: editingId ? "Зміни збережено." : "Завдання додано до програми тренерів.",
    });
    resetForm();
    await load();
  }

  async function toggle(task: MethodologyTask) {
    const result = await client
      .from("methodology_tasks")
      .update({ is_active: !task.is_active, updated_by: profile.id })
      .eq("id", task.id);
    if (result.error) {
      setMessage({ kind: "error", text: "Стан завдання не змінено." });
      return;
    }
    await load();
  }

  async function move(task: MethodologyTask, direction: -1 | 1) {
    const result = await client.rpc("move_methodology_task", {
      p_task_id: task.id,
      p_direction: direction,
    });
    if (result.error) {
      setMessage({ kind: "error", text: "Порядок завдань не змінено." });
      return;
    }
    await load();
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk-UA");
    return tasks.filter(
      (task) => (showInactive || task.is_active) && (
        !needle ||
        `${task.title} ${task.component ?? ""} ${task.description ?? ""}`
          .toLocaleLowerCase("uk-UA")
          .includes(needle)),
    );
  }, [query, tasks, showInactive]);

  return (
    <div className="management-grid">
      <form className="form-stack management-form" onSubmit={save}>
        <h3>{editingId ? "Редагування завдання" : "Нове навчальне завдання"}</h3>
        <label>
          <span>Фаза</span>
          <select
            value={form.phase}
            onChange={(event) =>
              setForm({ ...form, phase: event.target.value as MethodologyPhase })
            }
          >
            {Object.entries(PHASE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Рівень</span>
          <select
            value={form.level}
            onChange={(event) =>
              setForm({ ...form, level: event.target.value as MethodologyLevel })
            }
          >
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Назва</span>
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
        </label>
        <label>
          <span>Компонент</span>
          <input
            value={form.component}
            onChange={(event) => setForm({ ...form, component: event.target.value })}
            placeholder="Необов’язково"
          />
        </label>
        <label>
          <span>Опис</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <div className="inline-fields">
          <label>
            <span>Від U</span>
            <input
              type="number"
              min={6}
              max={MAX_AGE_GROUP}
              value={form.ageFrom}
              onChange={(event) =>
                setForm({ ...form, ageFrom: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>До U</span>
            <input
              type="number"
              min={6}
              max={MAX_AGE_GROUP}
              value={form.ageTo}
              onChange={(event) =>
                setForm({ ...form, ageTo: Number(event.target.value) })
              }
            />
          </label>
        </div>
        {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
        <div className="row-actions">
          <button className="primary-action">
            <ListChecks size={18} />
            {editingId ? "Зберегти зміни" : "Додати завдання"}
          </button>
          {editingId && (
            <button className="secondary-action" type="button" onClick={resetForm}>
              <RotateCcw size={17} />
              Скасувати
            </button>
          )}
        </div>
      </form>

      <div>
        <BulkContentActions client={client} dataset="tasks" rows={tasks} selected={selected} onSelected={setSelected} onChanged={load} />
        <label className="check-field"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} />Показати неактивні</label>
        <SearchField value={query} onChange={setQuery} placeholder="Пошук у програмі" />
        {visible.length ? (
          <div className="compact-list task-admin-list">
            {visible.map((task) => (
              <article key={task.id}>
                {task.is_active && <input className="bulk-row-checkbox" type="checkbox" aria-label={`Вибрати завдання: ${task.title}`} checked={selected.includes(task.id)} onChange={event => setSelected(current => event.target.checked ? [...current,task.id] : current.filter(id => id!==task.id))} />}
                <div>
                  <b>{task.title}</b>
                  <small>
                    {PHASE_LABELS[task.phase]} · {LEVEL_LABELS[task.level]} · U
                    {task.age_from}–U{task.age_to}
                    {!task.is_active ? " · Неактивне" : ""}
                  </small>
                </div>
                <div className="row-actions">
                  <button
                    aria-label={`Перемістити «${task.title}» вгору`}
                    className="icon-action"
                    type="button"
                    onClick={() => void move(task, -1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    aria-label={`Перемістити «${task.title}» вниз`}
                    className="icon-action"
                    type="button"
                    onClick={() => void move(task, 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    className="secondary-action small"
                    type="button"
                    onClick={() => edit(task)}
                  >
                    <Pencil size={15} />
                    Змінити
                  </button>
                  <button
                    className="secondary-action small"
                    type="button"
                    onClick={() => void toggle(task)}
                  >
                    {task.is_active ? "Деактивувати" : "Активувати"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Завдань не знайдено" />
        )}
      </div>
    </div>
  );
}
