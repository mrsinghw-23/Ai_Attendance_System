import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "profiles");

export async function saveProfileImage(
  userId: number,
  buffer: Buffer,
  extension: string
) {
  const dir = path.join(UPLOAD_ROOT, String(userId));
  await fs.mkdir(dir, { recursive: true });

  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, buffer);

  return `/uploads/profiles/${userId}/${filename}`;
}

export async function deleteProfileImageFile(imagePath: string | null | undefined) {
  if (!imagePath?.startsWith("/uploads/profiles/")) return;

  const absolutePath = path.join(process.cwd(), "public", imagePath);
  try {
    await fs.unlink(absolutePath);
  } catch {
    // File may already be removed.
  }
}

export function getExtensionFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}
