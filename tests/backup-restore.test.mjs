import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { webcrypto } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("encrypted backup can be restored only with its passphrase", async () => {
  const temporaryDirectory = await mkdtemp(`${tmpdir()}/champion-backup-test-`);
  const source = `${temporaryDirectory}/backup.encrypted.json`;
  const destination = `${temporaryDirectory}/backup.json`;
  const script = fileURLToPath(new URL("../scripts/decrypt-backup.mjs", import.meta.url));
  const passphrase = "test-passphrase-strong-2026";
  const payload = JSON.stringify({ school: "ЧЕМПІОН", players: [{ id: "synthetic" }] });

  try {
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await webcrypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await webcrypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 310_000 },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(payload),
    );
    await writeFile(
      source,
      JSON.stringify({
        format: "champion-backup-v1",
        cipher: "AES-256-GCM",
        kdf: {
          name: "PBKDF2-SHA-256",
          iterations: 310_000,
          salt: Buffer.from(salt).toString("base64"),
        },
        iv: Buffer.from(iv).toString("base64"),
        ciphertext: Buffer.from(ciphertext).toString("base64"),
      }),
    );

    await run(process.execPath, [script, source, destination], {
      env: { ...process.env, CHAMPION_BACKUP_PASSPHRASE: passphrase },
    });
    assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), JSON.parse(payload));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
