import { readFile, writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import process from "node:process";

const [, , sourcePath, destinationPath] = process.argv;
const passphrase = process.env.CHAMPION_BACKUP_PASSPHRASE;

if (!sourcePath || !destinationPath || !passphrase) {
  console.error(
    "Usage: CHAMPION_BACKUP_PASSPHRASE='<secret>' npm run backup:decrypt -- <encrypted.json> <restored.json>",
  );
  process.exit(1);
}

if (passphrase.length < 12) {
  console.error("The backup passphrase must contain at least 12 characters.");
  process.exit(1);
}

const envelope = JSON.parse(await readFile(sourcePath, "utf8"));
if (
  envelope.format !== "champion-backup-v1" ||
  envelope.cipher !== "AES-256-GCM" ||
  envelope.kdf?.name !== "PBKDF2-SHA-256"
) {
  throw new Error("Unsupported CHAMPION backup format.");
}

const encoder = new TextEncoder();
const keyMaterial = await webcrypto.subtle.importKey(
  "raw",
  encoder.encode(passphrase),
  "PBKDF2",
  false,
  ["deriveKey"],
);
const key = await webcrypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    hash: "SHA-256",
    salt: Buffer.from(envelope.kdf.salt, "base64"),
    iterations: envelope.kdf.iterations,
  },
  keyMaterial,
  { name: "AES-GCM", length: 256 },
  false,
  ["decrypt"],
);
const plaintext = await webcrypto.subtle.decrypt(
  { name: "AES-GCM", iv: Buffer.from(envelope.iv, "base64") },
  key,
  Buffer.from(envelope.ciphertext, "base64"),
);
const decoded = new TextDecoder().decode(plaintext);
JSON.parse(decoded);
await writeFile(destinationPath, decoded, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log(`Decrypted backup written to ${destinationPath}`);
