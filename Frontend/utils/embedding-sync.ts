import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const SYNC_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const SYNC_RESULT_MARKER = "__SYNC_RESULT__";

export type EmbeddingSyncStats = {
  images_processed?: number;
  embeddings_created?: number;
  embeddings_updated?: number;
  employees_covered?: number;
  skipped?: number;
  model_name?: string;
};

export type EmbeddingSyncResult = {
  success: boolean;
  output: string;
  stats: EmbeddingSyncStats | null;
  attempts: number;
};

function resolvePythonBin(serviceDir: string) {
  const candidates = [
    process.env.AI_PYTHON_PATH,
    path.join(serviceDir, ".venv", "Scripts", "python.exe"),
    path.join(serviceDir, ".venv", "bin", "python"),
    "python",
    "python3",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes("/")) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }

  return path.join(serviceDir, ".venv", "Scripts", "python.exe");
}

function parseSyncStats(output: string): EmbeddingSyncStats | null {
  const markerIndex = output.indexOf(SYNC_RESULT_MARKER);
  if (markerIndex >= 0) {
    try {
      return JSON.parse(
        output.slice(markerIndex + SYNC_RESULT_MARKER.length).trim()
      ) as EmbeddingSyncStats;
    } catch {
      return null;
    }
  }

  const dictMatch = output.match(/\{[^{}]*images_processed[^{}]*\}/);
  if (dictMatch) {
    try {
      return JSON.parse(dictMatch[0].replace(/'/g, '"')) as EmbeddingSyncStats;
    } catch {
      return null;
    }
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runSyncOnce(
  employeeId: number,
  pythonBin: string,
  scriptPath: string,
  serviceDir: string
) {
  return new Promise<{ exitCode: number | null; output: string }>((resolve) => {
    const chunks: string[] = [];
    const proc = spawn(
      pythonBin,
      [scriptPath, "--sync-embeddings", "--employee-id", String(employeeId)],
      {
        cwd: serviceDir,
        env: process.env,
      }
    );

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
    }, SYNC_TIMEOUT_MS);

    proc.stdout.on("data", (data) => chunks.push(String(data)));
    proc.stderr.on("data", (data) => chunks.push(String(data)));

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code,
        output: chunks.join("").trim(),
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        exitCode: null,
        output: error.message,
      });
    });
  });
}

export async function syncEmployeeEmbeddings(
  employeeId: number
): Promise<EmbeddingSyncResult> {
  const repoRoot = path.resolve(process.cwd(), "..");
  const serviceDir = path.join(repoRoot, "AI-Recognition-Service");
  const pythonBin = resolvePythonBin(serviceDir);
  const scriptPath = path.join(serviceDir, "main.py");

  let lastOutput = "";
  let lastStats: EmbeddingSyncStats | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const result = await runSyncOnce(
      employeeId,
      pythonBin,
      scriptPath,
      serviceDir
    );
    lastOutput = result.output;
    lastStats = parseSyncStats(result.output);

    const exitOk = result.exitCode === 0;
    const embeddingsWritten =
      (lastStats?.embeddings_created || 0) +
      (lastStats?.embeddings_updated || 0);
    const hadImages = (lastStats?.images_processed || 0) > 0;

    if (exitOk && (!hadImages || embeddingsWritten > 0)) {
      return {
        success: true,
        output: lastOutput,
        stats: lastStats,
        attempts: attempt + 1,
      };
    }

    if (attempt < MAX_RETRIES) {
      await sleep(1000 * (attempt + 1));
    }
  }

  console.error(
    `[embedding-sync] employee=${employeeId} failed after ${MAX_RETRIES + 1} attempts output=${lastOutput}`
  );

  return {
    success: false,
    output: lastOutput,
    stats: lastStats,
    attempts: MAX_RETRIES + 1,
  };
}

export async function checkAiPythonHealth() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const serviceDir = path.join(repoRoot, "AI-Recognition-Service");
  const pythonBin = resolvePythonBin(serviceDir);

  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const proc = spawn(
      pythonBin,
      ["-c", "import insightface; print('ok')"],
      { cwd: serviceDir, env: process.env }
    );

    const chunks: string[] = [];
    const timeout = setTimeout(() => proc.kill("SIGTERM"), 15_000);

    proc.stdout.on("data", (data) => chunks.push(String(data)));
    proc.stderr.on("data", (data) => chunks.push(String(data)));

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        output: chunks.join("").trim(),
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, output: error.message });
    });
  });
}
