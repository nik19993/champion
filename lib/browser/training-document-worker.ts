import { compressTrainingDocument } from "./training-document-engine.ts";

const scope = globalThis as unknown as {
  onmessage: ((message: MessageEvent<{ bytes: ArrayBuffer; name: string }>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = (message) => {
  void compressTrainingDocument(new Uint8Array(message.data.bytes), message.data.name).then((result) => {
    const bytes = new Uint8Array(result.bytes);
    scope.postMessage({ ok: true, ...result, bytes: bytes.buffer }, [bytes.buffer]);
  }).catch((error) => scope.postMessage({ ok: false, error: error instanceof Error ? error.message : "Не вдалося обробити документ." }));
};
