export function TrainingStepDescription({ description }: { description: string }) {
  const text = description.trim();
  if (!text) return null;

  return text.split(/(?:\r?\n[ \t]*){2,}/).map((paragraph, index) => (
    <p className="structure-step-description" key={index}>{paragraph}</p>
  ));
}
