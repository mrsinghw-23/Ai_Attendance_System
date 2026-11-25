import { getAIRecognitionSettings } from "@/services/ai-recognition.service";

export type UnknownFaceSource =
  | "pc_webcam"
  | "live_web_scan"
  | "gate_scan"
  | "cctv";

/** Attendance scanning only marks registered employees — never persist unknown snapshots. */
export async function shouldPersistUnknownFace(
  source: UnknownFaceSource
): Promise<boolean> {
  if (source === "pc_webcam" || source === "live_web_scan") {
    return false;
  }

  const settings = await getAIRecognitionSettings();
  return settings.storeUnknownFaces === true;
}
