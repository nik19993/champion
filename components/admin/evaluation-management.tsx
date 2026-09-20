"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ListChecks, Pencil, Plus, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  LoadingState,
  Pill,
  StatusMessage,
} from "@/components/common/workspace-ui";
import type { Profile } from "@/lib/domain/types";

type MetricKind = "physical_preparedness" | "game_activity";
type AgeBand = "" | "u6_u12" | "u13_u15";

interface EvaluationMetric {
  id: string;
  kind: MetricKind;
  age_from: number | null;
  age_to: number | null;
  name: string;
  default_unit: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

interface EvaluationMetricField {
  id: string;
  metric_id: string;
  label: string;
  unit: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

interface MetricFieldDraft {
  id?: string;
  label: string;
  unit: string;
  description: string;
}

const kindLabels: Record<MetricKind, string> = {
  physical_preparedness: "Тестування фізичної підготовленості",
  game_activity: "Складові ігрової діяльності",
};

const ageBandLabels: Record<Exclude<AgeBand, "">, string> = {
  u6_u12: "U6–U12",
  u13_u15: "U13–U15",
};

function ageBandValues(ageBand: AgeBand) {
  if (ageBand === "u6_u12") return { age_from: 6, age_to: 12 };
  if (ageBand === "u13_u15") return { age_from: 13, age_to: 15 };
  return { age_from: null, age_to: null };
}

function metricAgeBand(metric: EvaluationMetric): AgeBand {
  if (metric.age_from === 6 && metric.age_to === 12) return "u6_u12";
  if (metric.age_from === 13 && metric.age_to === 15) return "u13_u15";
  return "";
}

function saveError(error: { code?: string; message?: string } | null) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("EVALUATION_METRIC_LIMIT:PHYSICAL")) {
    return "У цьому віковому наборі вже є 4 активні тести. Спочатку деактивуйте або відредагуйте один із них.";
  }
  if (detail.includes("EVALUATION_METRIC_LIMIT:GAME_ACTIVITY")) {
    return "У розділі вже є 3 активні показники ігрової діяльності. Спочатку деактивуйте один із них.";
  }
  if (detail.includes("EVALUATION_METRIC_AGE_REQUIRED")) {
    return "Оберіть віковий набір для фізичного тесту.";
  }
  if (detail.includes("EVALUATION_FIELDS_REQUIRED")) {
    return "Фізичний тест повинен мати від 1 до 8 активних полів результату.";
  }
  if (detail.includes("EVALUATION_FIELD_DUPLICATE")) {
    return "Назви полів результату не повинні повторюватися.";
  }
  if (detail.includes("EVALUATION_FIELD_LABEL_INVALID")) {
    return "Перевірте назви полів результату.";
  }
  if (error?.code === "23505") return "Показник із такою назвою вже є у цьому віковому наборі.";
  return "Показник не збережено.";
}

export function EvaluationManagement({
  client,
  profile,
}: {
  client: SupabaseClient;
  profile: Profile;
}) {
  const [metrics, setMetrics] = useState<EvaluationMetric[]>([]);
  const [metricFields, setMetricFields] = useState<EvaluationMetricField[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<MetricKind>("physical_preparedness");
  const [ageBand, setAgeBand] = useState<AgeBand>("u6_u12");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<MetricFieldDraft[]>([
    { label: "", unit: "", description: "" },
  ]);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [metricResult, fieldResult] = await Promise.all([
      client
        .from("evaluation_metrics")
        .select("id, kind, age_from, age_to, name, default_unit, description, sort_order, is_active")
        .order("kind")
        .order("age_from", { nullsFirst: false })
        .order("sort_order")
        .order("name"),
      client
        .from("evaluation_metric_fields")
        .select("id, metric_id, label, unit, description, sort_order, is_active")
        .order("metric_id")
        .order("sort_order")
        .order("label"),
    ]);
    if (metricResult.error || fieldResult.error) {
      setMessage({ kind: "error", text: "Довідники оцінювання не завантажено." });
    } else {
      setMetrics((metricResult.data ?? []) as EvaluationMetric[]);
      setMetricFields((fieldResult.data ?? []) as EvaluationMetricField[]);
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setFields([{ label: "", unit: "", description: "" }]);
    if (kind === "physical_preparedness" && !ageBand) setAgeBand("u6_u12");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    if (kind === "physical_preparedness" && !ageBand) {
      setBusy(false);
      setMessage({ kind: "error", text: "Оберіть віковий набір для фізичного тесту." });
      return;
    }
    const ages = kind === "physical_preparedness"
      ? ageBandValues(ageBand)
      : { age_from: null, age_to: null };
    const preparedFields = fields.map((field) => ({
      ...(field.id ? { id: field.id } : {}),
      label: field.label.trim(),
      unit: field.unit.trim(),
      description: field.description.trim(),
    }));
    if (kind === "physical_preparedness") {
      if (preparedFields.some((field) => !field.label)) {
        setBusy(false);
        setMessage({ kind: "error", text: "Заповніть назву кожного поля результату." });
        return;
      }
      const normalizedLabels = preparedFields.map((field) => field.label.toLocaleLowerCase("uk-UA"));
      if (new Set(normalizedLabels).size !== normalizedLabels.length) {
        setBusy(false);
        setMessage({ kind: "error", text: "Назви полів результату не повинні повторюватися." });
        return;
      }
    }
    const payload = {
      kind,
      ...ages,
      name: name.trim(),
      default_unit: null,
      description: description.trim() || null,
      updated_by: profile.id,
    };
    const result = kind === "physical_preparedness"
      ? await client.rpc("save_physical_evaluation_metric", {
          p_metric_id: editingId,
          p_age_from: ages.age_from,
          p_age_to: ages.age_to,
          p_name: name.trim(),
          p_description: description.trim() || null,
          p_fields: preparedFields,
        })
      : editingId
        ? await client.from("evaluation_metrics").update(payload).eq("id", editingId)
        : await client.from("evaluation_metrics").insert({
            ...payload,
            sort_order:
              Math.max(
                0,
                ...metrics
                  .filter((metric) => metric.kind === kind)
                  .map((metric) => metric.sort_order),
              ) + 1,
            is_active: true,
            created_by: profile.id,
          });
    setBusy(false);
    if (result.error) {
      setMessage({
        kind: "error",
        text: saveError(result.error),
      });
      return;
    }
    setMessage({ kind: "success", text: editingId ? "Показник оновлено." : "Показник додано." });
    resetForm();
    await load();
  }

  function edit(metric: EvaluationMetric) {
    setEditingId(metric.id);
    setKind(metric.kind);
    setAgeBand(metricAgeBand(metric));
    setName(metric.name);
    setDescription(metric.description ?? "");
    const activeFields = metricFields
      .filter((field) => field.metric_id === metric.id && field.is_active)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((field) => ({
        id: field.id,
        label: field.label,
        unit: field.unit ?? "",
        description: field.description ?? "",
      }));
    setFields(activeFields.length
      ? activeFields
      : [{ label: "Результат", unit: metric.default_unit ?? "", description: "" }]);
    setMessage(null);
  }

  async function toggle(metric: EvaluationMetric) {
    setMessage(null);
    if (!metric.is_active) {
      const sameSetActive = metrics.filter((item) => item.is_active && item.id !== metric.id && (
        metric.kind === "game_activity"
          ? item.kind === "game_activity"
          : item.kind === "physical_preparedness"
            && item.age_from === metric.age_from
            && item.age_to === metric.age_to
      )).length;
      const limit = metric.kind === "game_activity" ? 3 : 4;
      if (sameSetActive >= limit) {
        setMessage({
          kind: "error",
          text: metric.kind === "game_activity"
            ? "Уже активні всі 3 показники ігрової діяльності."
            : "Уже активні всі 4 тести цього вікового набору.",
        });
        return;
      }
    }
    const result = await client
      .from("evaluation_metrics")
      .update({ is_active: !metric.is_active, updated_by: profile.id })
      .eq("id", metric.id);
    if (result.error) {
      setMessage({ kind: "error", text: saveError(result.error) });
      return;
    }
    await load();
  }

  const grouped = useMemo(
    () => ({
      u6_u12: metrics.filter((metric) => metric.kind === "physical_preparedness" && metric.age_from === 6 && metric.age_to === 12),
      u13_u15: metrics.filter((metric) => metric.kind === "physical_preparedness" && metric.age_from === 13 && metric.age_to === 15),
      unassigned: metrics.filter((metric) => metric.kind === "physical_preparedness" && (metric.age_from === null || metric.age_to === null)),
      game_activity: metrics.filter((metric) => metric.kind === "game_activity"),
    }),
    [metrics],
  );

  function metricList(title: string, items: EvaluationMetric[], limit?: number) {
    const activeCount = items.filter((metric) => metric.is_active).length;
    return (
      <section>
        <div className="form-title-row">
          <h3 className="management-title">{title}</h3>
          {limit && <Pill tone={activeCount === limit ? "success" : "warning"}>{activeCount}/{limit} активні</Pill>}
        </div>
        {items.length ? (
          <div className="compact-list">
            {items.map((metric) => (
              <article key={metric.id}>
                <div>
                  <b>{metric.name}</b>
                  <small>
                    {metric.kind === "physical_preparedness"
                      ? `Поля: ${metricFields
                          .filter((field) => field.metric_id === metric.id && field.is_active)
                          .sort((left, right) => left.sort_order - right.sort_order)
                          .map((field) => `${field.label}${field.unit ? ` (${field.unit})` : ""}`)
                          .join(", ") || "не налаштовано"}`
                      : metric.description || "Оцінка від 1 до 5 балів."}
                  </small>
                  {metric.kind === "physical_preparedness" && metric.description && <small>{metric.description}</small>}
                </div>
                <div className="inline-actions">
                  <Pill tone={metric.is_active ? "success" : "neutral"}>{metric.is_active ? "Активний" : "Неактивний"}</Pill>
                  <button className="secondary-action small" type="button" onClick={() => edit(metric)}><Pencil size={15} />Редагувати</button>
                  <button className="secondary-action small" type="button" onClick={() => void toggle(metric)}>{metric.is_active ? "Деактивувати" : "Активувати"}</button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="Показників ще немає" />}
      </section>
    );
  }

  return (
    <div className="management-grid">
      <form className="form-stack management-form" onSubmit={save}>
        <h3>{editingId ? "Редагування показника" : "Новий показник"}</h3>
        <label>
          <span>Розділ</span>
          <select
            value={kind}
            onChange={(event) => {
              const nextKind = event.target.value as MetricKind;
              setKind(nextKind);
              if (nextKind === "physical_preparedness" && !ageBand) setAgeBand("u6_u12");
            }}
            disabled={Boolean(editingId)}
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        {kind === "physical_preparedness" && (
          <label>
            <span>Віковий набір</span>
            <select value={ageBand} onChange={(event) => setAgeBand(event.target.value as AgeBand)} required>
              <option value="" disabled>Оберіть віковий набір</option>
              {Object.entries(ageBandLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <small>Для кожного вікового набору потрібно налаштувати 4 активні тести.</small>
          </label>
        )}
        <label>
          <span>{kind === "physical_preparedness" ? "Назва тесту" : "Назва складової"}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} />
        </label>
        {kind === "physical_preparedness" && (
          <fieldset>
            <legend>Поля результату цього тесту</legend>
            <p className="muted evaluation-fields-help">
              Один тест може мати кілька результатів. Наприклад, тест 505 має оббігання справа і зліва.
            </p>
            <div className="evaluation-field-editors">
              {fields.map((field, index) => (
                <div className="evaluation-field-editor" key={field.id ?? `new-${index}`}>
                  <label>
                    <span>Назва поля</span>
                    <input
                      value={field.label}
                      onChange={(event) => setFields((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, label: event.target.value } : item
                      )))}
                      maxLength={120}
                      placeholder={index === 0 ? "Наприклад, Краща спроба" : "Наприклад, Оббігання зліва"}
                      required
                    />
                  </label>
                  <label>
                    <span>Одиниця</span>
                    <input
                      value={field.unit}
                      onChange={(event) => setFields((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, unit: event.target.value } : item
                      )))}
                      maxLength={40}
                      placeholder="с, см, м або разів"
                    />
                  </label>
                  {fields.length > 1 && (
                    <button
                      className="secondary-action small evaluation-field-remove"
                      type="button"
                      aria-label={`Видалити поле ${field.label || index + 1}`}
                      onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <X size={16} />Видалити
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="secondary-action small"
              type="button"
              disabled={fields.length >= 8}
              onClick={() => setFields((current) => [
                ...current,
                { label: "", unit: "", description: "" },
              ])}
            >
              <Plus size={16} />Додати поле результату
            </button>
          </fieldset>
        )}
        <label>
          <span>Пояснення для тренерів</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
        </label>
        {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
        <div className="inline-actions">
          <button className="primary-action" disabled={busy}>
            {editingId ? <ListChecks size={18} /> : <Plus size={18} />}
            {busy ? "Збереження…" : editingId ? "Зберегти зміни" : "Додати показник"}
          </button>
          {editingId && <button className="secondary-action" type="button" onClick={resetForm}>Скасувати</button>}
        </div>
      </form>

      <div className="form-stack">
        {loading ? <LoadingState /> : <>
          {metricList("Фізичні тести · U6–U12", grouped.u6_u12, 4)}
          {metricList("Фізичні тести · U13–U15", grouped.u13_u15, 4)}
          {grouped.unassigned.length > 0 && metricList("Потрібно визначити віковий набір", grouped.unassigned)}
          {metricList(kindLabels.game_activity, grouped.game_activity, 3)}
        </>}
      </div>
    </div>
  );
}
