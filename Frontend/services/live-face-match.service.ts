import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { getAIRecognitionSettings } from "@/services/ai-recognition.service";
import {
  getEmployeeEncodingCache,
  matchEmployeeFromEncoding,
} from "@/services/employee-encoding-cache.service";

export interface FrameMatchResult {
  matched: boolean;
  face_detected?: boolean;
  employee_id?: number;
  employee_name?: string;
  employee_code?: string;
  confidence?: number;
  error?: string;
}

function servicePaths() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const serviceDir = path.join(repoRoot, "AI-Recognition-Service");
  const pythonBin =
    process.env.AI_PYTHON_PATH ||
    path.join(serviceDir, ".venv", "Scripts", "python.exe");
  const scriptPath = path.join(serviceDir, "recognize_frame.py");
  return { serviceDir, pythonBin, scriptPath };
}

function runPythonScript(args: string[]): Promise<Record<string, unknown>> {
  const { serviceDir, pythonBin, scriptPath } = servicePaths();

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const proc = spawn(pythonBin, [scriptPath, ...args], {
      cwd: serviceDir,
      env: process.env,
    });

    proc.stdout.on("data", (data) => chunks.push(String(data)));
    proc.stderr.on("data", (data) => chunks.push(String(data)));

    proc.on("close", () => {
      const output = chunks.join("").trim();
      try {
        const lastLine = output.split("\n").filter(Boolean).pop() || "{}";
        resolve(JSON.parse(lastLine) as Record<string, unknown>);
      } catch {
        resolve({ matched: false, error: output || "recognition failed" });
      }
    });

    proc.on("error", (error) => {
      resolve({ matched: false, error: error.message });
    });
  });
}

function toFrameMatchResult(payload: Record<string, unknown>): FrameMatchResult {
  return {
    matched: Boolean(payload.matched),
    face_detected:
      payload.face_detected == null ? undefined : Boolean(payload.face_detected),
    employee_id:
      payload.employee_id == null ? undefined : Number(payload.employee_id),
    employee_name:
      payload.employee_name == null ? undefined : String(payload.employee_name),
    employee_code:
      payload.employee_code == null ? undefined : String(payload.employee_code),
    confidence:
      payload.confidence == null ? undefined : Number(payload.confidence),
    error: payload.error == null ? undefined : String(payload.error),
  };
}

async function matchWithDatabaseEmbeddings(
  imagePath: string,
  minConfidence: number
): Promise<FrameMatchResult | null> {
  const payload = await runPythonScript([imagePath, "--embed-only"]);
  const embedding = payload.embedding;
  if (!payload.face_detected || !Array.isArray(embedding) || embedding.length === 0) {
    return null;
  }

  const probe = embedding
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (probe.length === 0) return null;

  const employees = await getEmployeeEncodingCache(true);
  const match = matchEmployeeFromEncoding(probe, employees, { minConfidence });

  if (!match.matched) {
    return {
      matched: false,
      face_detected: true,
      confidence: match.confidence,
      error: "no match",
    };
  }

  return {
    matched: true,
    face_detected: true,
    employee_id: match.employee.employee_id,
    employee_name: match.employee.employee_name,
    employee_code: match.employee.employee_code,
    confidence: match.confidence,
  };
}

export async function matchFaceFromImageFile(
  imagePath: string
): Promise<FrameMatchResult> {
  const settings = await getAIRecognitionSettings();
  const pythonPayload = await runPythonScript([imagePath]);
  const pythonResult = toFrameMatchResult(pythonPayload);

  if (pythonResult.matched) {
    return pythonResult;
  }

  if (pythonResult.error && !pythonResult.face_detected) {
    const nodeResult = await matchWithDatabaseEmbeddings(
      imagePath,
      settings.confidenceThreshold
    );
    if (nodeResult) {
      return nodeResult;
    }
  }

  if (pythonResult.face_detected && !pythonResult.matched) {
    const nodeResult = await matchWithDatabaseEmbeddings(
      imagePath,
      settings.confidenceThreshold
    );
    if (nodeResult?.matched) {
      return nodeResult;
    }
  }

  return pythonResult;
}

export async function matchFaceFromBuffer(
  buffer: Buffer
): Promise<FrameMatchResult> {
  const tempDir = path.join(os.tmpdir(), "ai-attendance-live");
  await fs.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `frame-${Date.now()}.jpg`);

  try {
    await fs.writeFile(tempPath, buffer);
    return await matchFaceFromImageFile(tempPath);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
