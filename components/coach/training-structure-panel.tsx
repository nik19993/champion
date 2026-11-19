import { BookOpenCheck, Timer } from "lucide-react";
import { TrainingStepDescription } from "@/components/common/training-step-description";
import { EmptyState, Pill } from "@/components/common/workspace-ui";
import type { TrainingStructure } from "@/lib/domain/types";

interface Props {
  age: number;
  structures: TrainingStructure[];
}

function stepDescriptionForAge(description: string, age: number) {
  const text = description.trim();
  // An editable description can contain variants headed "9–12 років:", one per line.
  const headings = [...text.matchAll(/^(\d{1,2})[–-](\d{1,2}) років:[ \t]*\r?$/gm)];
  if (headings[0]?.index !== 0) return description;

  const index = headings.findIndex(([, from, to]) => Number(from) <= age && age <= Number(to));
  if (index < 0) return description;
  const heading = headings[index];
  const selected = text.slice((heading.index ?? 0) + heading[0].length, headings[index + 1]?.index).trim();
  return selected || description;
}

export function TrainingStructurePanel({ age, structures }: Props) {
  const structure = structures.find((item) => item.is_active && item.age_from <= age && item.age_to >= age);
  if (!structure) return <EmptyState title={`Структуру для U${age} ще не налаштовано`} />;

  const steps = [...(structure.training_structure_steps ?? [])].sort((a, b) => a.position - b.position);
  const specifiedMinutes = steps.reduce((sum, step) => sum + (step.duration_minutes ?? 0), 0);
  const young = age >= 6 && age <= 8;

  return (
    <section className="panel-section training-structure-panel">
      <div className="structure-head">
        <span className="tile-icon gold"><BookOpenCheck /></span>
        <div>
          <p className="eyebrow">{young ? "6–8 років" : "9 років і старші"}</p>
          <h2>{structure.name}</h2>
          {structure.max_duration_minutes != null ? (
            <p className="structure-duration"><Timer size={16} /> Тривалість заняття: до {structure.max_duration_minutes} хвилин</p>
          ) : specifiedMinutes > 0 ? <p>Орієнтовна тривалість блоків: {specifiedMinutes} хвилин</p> : null}
        </div>
      </div>

      <div className="structure-guidance">
        <p>Фактичну тривалість заняття тренер визначає з урахуванням віку, підготовленості, погодних умов, інтенсивності та самопочуття гравців.</p>
        {young && <p><strong>Формати ігор:</strong> від 1×1 до 4×4 із можливістю додавання нейтральних гравців.</p>}
      </div>

      <section className="structure-guidance" aria-label="Початок заняття">
        <h3>Підготовча частина</h3>
        <p>Організований збір гравців у визначеному місці. Коротка нарада: обговорення завдань заняття, контроль самопочуття, нагадування правил безпеки.</p>
      </section>

      <div className="structure-guidance">
        <p><strong>Усі блоки заняття спрямовані на вирішення завдання тренування.</strong>{" "}У розминці тренер добирає рухи, вправи з м’ячем або ігрові ситуації, які готують гравців до технічних прийомів, рішень і взаємодій, потрібних в основній частині.</p>
      </div>

      <h3 className="structure-section-title">{young ? "4 ігрові блоки" : "4 основні блоки та вправа тренера за потреби"}</h3>
      {steps.length ? (
        <ol className="structure-steps">
          {steps.map((step) => (
            <li key={step.id}>
              <span>{step.position}</span>
              <div>
                <div>
                  <h3>{step.title}</h3>
                  {step.is_optional ? <Pill tone="neutral">За потреби · у будь-якій частині</Pill> : step.duration_minutes != null ? <Pill tone="teal"><Timer size={14} />{step.duration_minutes} хв</Pill> : null}
                </div>
                {step.description && <TrainingStepDescription description={stepDescriptionForAge(step.description, age)} />}
              </div>
            </li>
          ))}
        </ol>
      ) : <EmptyState title="Блоки заняття ще не додано" />}

      <section className="structure-guidance" aria-label="Дозування та перерви">
        <h3>Дозування: щонайменше дві перерви в кожній вправі</h3>
        <p>Для кожної вправи тренер визначає кількість повторень і серій, тривалість роботи та відпочинку. Щонайменше три робочі серії розділяються двома перервами:</p>
        <ol className="structure-breaks">
          <li><strong>Перша серія → перша перерва.</strong> Відпочинок. Тренер ставить запитання й дає дітям можливість порадитися між собою, провести короткі командні наради та підказати одне одному.</li>
          <li><strong>Друга серія → друга перерва.</strong> Гравці перевіряють запропоновані рішення. Після серії — відпочинок та обговорення. Якщо труднощі зберігаються, тренер дає конкретні підказки, інструкції або показує потрібний спосіб виконання.</li>
          <li><strong>Третя серія.</strong> Повторне виконання з урахуванням обговорення та уточнень. За потреби тренер додає наступні серії та перерви.</li>
        </ol>
      </section>

      <section className="structure-guidance" aria-label="Заключна частина">
        <h3>Заключна частина</h3>
        <p>Контроль самопочуття. Обговорення підсумків заняття: що вдалося, що було складним і що варто вдосконалити. Подальший план роботи. Тренер у застосунку відзначає присутність гравців та, за наявності, фіксує жовті картки й картки клубу. Збір інвентаря та речей. Звільнення майданчика.</p>
      </section>
    </section>
  );
}
