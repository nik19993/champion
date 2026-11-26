export const TRAINING_DOCUMENT_LIMIT = 1_000_000;
export const TRAINING_DOCUMENT_INPUT_LIMIT = 20 * 1024 * 1024;
export const TRAINING_DOCUMENT_ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,.webp";

const DOCUMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Some browsers supply an empty MIME type for Word files. The server still
// checks the file signature and active content before marking it clean.
function documentType(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = DOCUMENT_TYPES[extension];
  if (!mimeType) throw new Error("Оберіть PDF, Word (.docx), JPG, PNG або WebP. Файл .doc спочатку збережіть як .docx або PDF.");
  if (!file.size) throw new Error("Файл порожній. Виберіть документ із вмістом.");
  return mimeType;
}

export function trainingDocumentInputType(file: Pick<File, "name" | "size">) {
  const mime = documentType(file);
  if (file.size > TRAINING_DOCUMENT_INPUT_LIMIT) throw new Error("Вихідний файл перевищує 20 МБ. Зменште його розмір перед обробкою.");
  return mime;
}

export function trainingDocumentType(file: Pick<File, "name" | "size">) {
  const mime = documentType(file);
  if (file.size > TRAINING_DOCUMENT_LIMIT) throw new Error("Документ перевищує 1 МБ після стискання. Виберіть менший файл. Тренування можна зберегти без документа.");
  return mime;
}

export function trainingDocumentSize(bytes: number) {
  return bytes < 1_000_000 ? `${Math.max(1, Math.ceil(bytes / 1_000))} КБ` : `${(bytes / 1_000_000).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} МБ`;
}

// Used only for local document preparation, never for database/API errors.
export function trainingDocumentError(error: unknown) {
  if (error instanceof Error && /[А-Яа-яІіЇїЄєҐґ]/.test(error.message)) return error.message;
  return "Не вдалося обробити документ. Перевірте файл або збережіть тренування без документа.";
}
