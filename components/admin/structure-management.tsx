"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, Pill, StatusMessage } from "@/components/common/workspace-ui";
import type {
  Profile,
  TrainingStructure,
  TrainingStructureStep,
} from "@/lib/domain/types";

interface Props {
  client: SupabaseClient;
  profile: Profile;
}

export function EnhancedStructureManagement({ client, profile }: Props) {
  const [structures, setStructures] = useState<TrainingStructure[]>([]);
  const [selected, setSelected] = useState("");
  const [structureId, setStructureId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ageFrom, setAgeFrom] = useState(6);
  const [ageTo, setAgeTo] = useState(8);
  const [stepId, setStepId] = useState<string | null>(null);
  const [stepTitle, setStepTitle] = useState("");
  const [duration, setDuration] = useState(10);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const result = await client
      .from("training_structures")
      .select(
        "id, name, age_from, age_to, is_active, training_structure_steps(id, structure_id, position, duration_minutes, title, description)",
      )
      .order("age_from")
      .order("name");

    if (result.error) {
      setMessage({ kind: "error", text: "Структури занять не завантажено." });
      return;
    }
    const rows = (result.data ?? []) as unknown as TrainingStructure[];
    setStructures(rows);
    setSelected((current) =>
      current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? ""),
    );
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetStructure() {
    setStructureId(null);
    setName("");
    setAgeFrom(6);
    setAgeTo(8);
  }

  function editStructure(structure: TrainingStructure) {
    setStructureId(structure.id);
    setName(structure.name);
    setAgeFrom(structure.age_from);
    setAgeTo(structure.age_to);
  }

  async function saveStructure(event: FormEvent) {
    event.preventDefault();
    if (ageFrom > ageTo) {
      setMessage({ kind: "error", text: "Початковий вік не може бути більшим за кінцевий." });
      return;
    }
    const payload = {
      name: name.trim(),
      age_from: ageFrom,
      age_to: ageTo,
      updated_by: profile.id,
    };
    const result = structureId
      ? await client.from("training_structures").update(payload).eq("id", structureId)
      : await client.from("training_structures").insert({
          ...payload,
          is_active: true,
          created_by: profile.id,
        });
    if (result.error) {
      setMessage({ kind: "error", text: "Структуру не збережено." });
      return;
    }
    setMessage({ kind: "success", text: "Структуру збережено." });
    resetStructure();
    await load();
  }

  async function toggleStructure(structure: TrainingStructure) {
    const result = await client
      .from("training_structures")
      .update({ is_active: !structure.is_active, updated_by: profile.id })
      .eq("id", structure.id);
    if (result.error) {
      setMessage({ kind: "error", text: "Стан структури не змінено." });
      return;
    }
    await load();
  }

  function resetStep() {
    setStepId(null);
    setStepTitle("");
    setDuration(10);
    setDescription("");
  }

  function editStep(step: TrainingStructureStep) {
    setSelected(step.structure_id);
    setStepId(step.id);
    setStepTitle(step.title);
    setDuration(step.duration_minutes);
    setDescription(step.description ?? "");
  }

  async function saveStep(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const structure = structures.find((item) => item.id === selected);
    const payload = {
      structure_id: selected,
      duration_minutes: duration,
      title: stepTitle.trim(),
      description: description.trim() || null,
      updated_by: profile.id,
    };
    const result = stepId
      ? await client.from("training_structure_steps").update(payload).eq("id", stepId)
      : await client.from("training_structure_steps").insert({
          ...payload,
          position:
            Math.max(
              0,
              ...(structure?.training_structure_steps ?? []).map((step) => step.position),
            ) + 1,
          created_by: profile.id,
        });
    if (result.error) {
      setMessage({ kind: "error", text: "Частину заняття не збережено." });
      return;
    }
    setMessage({ kind: "success", text: "Частину заняття збережено." });
    resetStep();
    await load();
  }

  async function moveStep(step: TrainingStructureStep, direction: -1 | 1) {
    const result = await client.rpc("move_training_step", {
      p_step_id: step.id,
      p_direction: direction,
    });
    if (result.error) {
      setMessage({ kind: "error", text: "Порядок частин не змінено." });
      return;
    }
    await load();
  }

  return (
    <div className="management-grid">
      <div>
        <form className="form-stack management-form" onSubmit={saveStructure}>
          <h3>{structureId ? "Редагування структури" : "Віковий діапазон"}</h3>
          <label>
            <span>Назва структури</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <div className="inline-fields">
            <label>
              <span>Від U</span>
              <input
                type="number"
                min={6}
                max={15}
                value={ageFrom}
                onChange={(event) => setAgeFrom(Number(event.target.value))}
              />
            </label>
            <label>
              <span>До U</span>
              <input
                type="number"
                min={6}
                max={15}
                value={ageTo}
                onChange={(event) => setAgeTo(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="row-actions">
            <button className="primary-action">
              <BookOpenCheck size={18} />
              {structureId ? "Зберегти зміни" : "Додати структуру"}
            </button>
            {structureId && (
              <button className="secondary-action" type="button" onClick={resetStructure}>
                <RotateCcw size={17} />
                Скасувати
              </button>
            )}
          </div>
        </form>

        <form className="form-stack management-form secondary-form" onSubmit={saveStep}>
          <h3>{stepId ? "Редагування частини" : "Нова частина заняття"}</h3>
          <label>
            <span>Структура</span>
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              {structures.map((structure) => (
                <option value={structure.id} key={structure.id}>
                  {structure.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Назва частини</span>
            <input
              value={stepTitle}
              onChange={(event) => setStepTitle(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Тривалість, хв</span>
            <input
              type="number"
              min={1}
              max={180}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Опис</span>
            <textarea
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="row-actions">
            <button className="secondary-action" disabled={!selected}>
              {stepId ? "Зберегти частину" : "Додати частину"}
            </button>
            {stepId && (
              <button className="secondary-action" type="button" onClick={resetStep}>
                Скасувати
              </button>
            )}
          </div>
        </form>
        {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
      </div>

      <div className="structure-admin-list">
        {structures.length ? (
          structures.map((structure) => (
            <article key={structure.id}>
              <header>
                <div>
                  <b>{structure.name}</b>
                  <small>
                    U{structure.age_from}–U{structure.age_to}
                  </small>
                </div>
                <div className="row-actions">
                  <Pill tone={structure.is_active ? "success" : "neutral"}>
                    {structure.is_active ? "Активна" : "Неактивна"}
                  </Pill>
                  <button
                    className="secondary-action small"
                    type="button"
                    onClick={() => editStructure(structure)}
                  >
                    <Pencil size={15} />
                    Змінити
                  </button>
                  <button
                    className="secondary-action small"
                    type="button"
                    onClick={() => void toggleStructure(structure)}
                  >
                    {structure.is_active ? "Деактивувати" : "Активувати"}
                  </button>
                </div>
              </header>
              <ol>
                {[...(structure.training_structure_steps ?? [])]
                  .sort((a, b) => a.position - b.position)
                  .map((step) => (
                    <li key={step.id}>
                      <span>{step.position}</span>
                      <div>
                        <b>{step.title}</b>
                        <small>
                          {step.duration_minutes} хв
                          {step.description ? ` · ${step.description}` : ""}
                        </small>
                      </div>
                      <div className="row-actions">
                        <button
                          aria-label={`Перемістити «${step.title}» вгору`}
                          className="icon-action"
                          type="button"
                          onClick={() => void moveStep(step, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          aria-label={`Перемістити «${step.title}» вниз`}
                          className="icon-action"
                          type="button"
                          onClick={() => void moveStep(step, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          className="secondary-action small"
                          type="button"
                          onClick={() => editStep(step)}
                        >
                          <Pencil size={15} />
                          Змінити
                        </button>
                      </div>
                    </li>
                  ))}
              </ol>
            </article>
          ))
        ) : (
          <EmptyState title="Структур занять ще немає" />
        )}
      </div>
    </div>
  );
}
