export const TRAINING_DOCUMENT_LIMIT = 20 * 1024 * 1024;
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
export function trainingDocumentType(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = DOCUMENT_TYPES[extension];
  if (!mimeType) throw new Error("Оберіть PDF, Word (.docx), JPG, PNG або WebP. Файл .doc спочатку збережіть як .docx або PDF.");
  if (!file.size) throw new Error("Файл порожній. Виберіть документ із вмістом.");
  if (file.size > TRAINING_DOCUMENT_LIMIT) throw new Error("Документ перевищує 20 МБ. Зменште його розмір і повторіть спробу.");
  return mimeType;
}
