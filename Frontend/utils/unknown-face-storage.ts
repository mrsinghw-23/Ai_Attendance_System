import fs from "fs/promises";
import path from "path";
import { nowIsoInTimezone } from "@/utils/timezone";

export async function saveUnknownFaceImage(
  buffer: Buffer,
  scope: string | number
): Promise<string> {
  const safeScope = String(scope).replace(/[^\w.-]/g, "_") || "webcam";
  const dir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "unknown",
    safeScope
  );
  await fs.mkdir(dir, { recursive: true });
  const stamp = nowIsoInTimezone().replace(/[:.]/g, "-");
  const filename = `${stamp}.jpg`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/unknown/${safeScope}/${filename}`;
}
