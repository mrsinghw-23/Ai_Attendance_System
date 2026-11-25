import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "AI_ATTENDANCE_SUPER_SECRET_2026";

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(cipherText: string) {
  const key = getEncryptionKey();
  const buffer = Buffer.from(cipherText, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function hasEncryptedSecret(value: string | null | undefined) {
  return Boolean(value && value.length > 0);
}
