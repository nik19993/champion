interface EncryptedBackup {
  format: "champion-backup-v1";
  cipher: "AES-256-GCM";
  kdf: {
    name: "PBKDF2-SHA-256";
    iterations: number;
    salt: string;
  };
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

export async function encryptBackup(
  plaintext: string,
  passphrase: string,
): Promise<EncryptedBackup> {
  if (passphrase.length < 12) {
    throw new Error("Пароль резервної копії має містити щонайменше 12 символів.");
  }

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 310_000;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  return {
    format: "champion-backup-v1",
    cipher: "AES-256-GCM",
    kdf: {
      name: "PBKDF2-SHA-256",
      iterations,
      salt: bytesToBase64(salt),
    },
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}
