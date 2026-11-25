export type EmployeeAIReadiness =
  | "NO_FACE"
  | "PARTIAL"
  | "SYNC_PENDING"
  | "AI_READY";

export type AIReadinessInput = {
  imageCount: number;
  embeddingCount: number;
  profileStatus?: string | null;
  faceRegistrationStatus?: string | null;
};

export function deriveAIReadiness(input: AIReadinessInput): EmployeeAIReadiness {
  const imageCount = Math.max(0, input.imageCount);
  const embeddingCount = Math.max(0, input.embeddingCount);

  if (imageCount === 0) return "NO_FACE";
  if (embeddingCount > 0) return "AI_READY";

  const posesComplete =
    input.profileStatus === "FULLY_REGISTERED" ||
    input.faceRegistrationStatus === "REGISTERED" ||
    imageCount >= 4;

  return posesComplete ? "SYNC_PENDING" : "PARTIAL";
}

export const AI_READINESS_LABELS: Record<
  EmployeeAIReadiness,
  { label: string; title: string }
> = {
  AI_READY: {
    label: "AI Ready",
    title: "Face registered and AI embeddings synced — camera can mark attendance",
  },
  SYNC_PENDING: {
    label: "Sync Pending",
    title:
      "All poses saved but AI embeddings missing — use Sync AI Embeddings on the profile",
  },
  PARTIAL: {
    label: "Partial",
    title: "Some face poses missing — complete live registration for all 4 poses",
  },
  NO_FACE: {
    label: "No Face",
    title: "No registered face — use manual check-in or complete face enrollment",
  },
};
