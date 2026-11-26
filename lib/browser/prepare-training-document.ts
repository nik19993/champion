import { TRAINING_DOCUMENT_LIMIT, trainingDocumentInputType, trainingDocumentType } from "../domain/training-document.ts";

export interface PreparedTrainingDocument {
  file: File;
  originalSize: number;
  attempted: true;
  note?: string;
}

export async function prepareTrainingDocument(file: File, options: { signal?: AbortSignal; timeoutMs?: number; workerFactory?: () => Worker } = {}): Promise<PreparedTrainingDocument> {
  trainingDocumentInputType(file);
  if (options.signal?.aborted) throw new DOMException("Обробку скасовано.", "AbortError");
  const bytes = await file.arrayBuffer();
  if (options.signal?.aborted) throw new DOMException("Обробку скасовано.", "AbortError");
  return new Promise((resolve, reject) => {
    let worker: Worker;
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: Error, result?: PreparedTrainingDocument) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); options.signal?.removeEventListener("abort", abort); worker?.terminate();
      if (error) reject(error); else if (result) resolve(result);
    };
    const abort = () => finish(new DOMException("Обробку скасовано.", "AbortError"));
    const unavailable = () => {
      if (file.size <= TRAINING_DOCUMENT_LIMIT) finish(undefined, { file, originalSize: file.size, attempted: true, note: "Додаткове стискання недоступне. Файл уже в межах 1 МБ." });
      else finish(new Error("Не вдалося завершити стискання до 1 МБ. Виберіть менший файл. Тренування можна зберегти без документа."));
    };
    try {
      worker = options.workerFactory?.() ?? new Worker(new URL("./training-document-worker.ts", import.meta.url), { type: "module" });
      options.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(unavailable, options.timeoutMs ?? 30_000);
      worker.onerror = (event) => { event.preventDefault(); unavailable(); };
      worker.onmessage = (event: MessageEvent<{ ok: boolean; error?: string; bytes?: ArrayBuffer; name?: string; mime?: string; note?: string }>) => {
        if (!event.data.ok || !event.data.bytes || !event.data.name || !event.data.mime) {
          finish(new Error(event.data.error ?? "Не вдалося обробити документ.")); return;
        }
        try {
          const processed = new File([event.data.bytes], event.data.name, { type: event.data.mime, lastModified: file.lastModified });
          trainingDocumentType(processed);
          finish(undefined, { file: processed.size < file.size ? processed : file, originalSize: file.size, attempted: true, note: event.data.note });
        } catch (error) { finish(error instanceof Error ? error : new Error("Документ перевищує 1 МБ.")); }
      };
      worker.postMessage({ bytes, name: file.name }, [bytes]);
    } catch { unavailable(); }
  });
}
