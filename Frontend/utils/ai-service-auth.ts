import { NextRequest } from "next/server";

export function getAIServiceKey() {
  return (
    process.env.AI_SERVICE_API_KEY ||
    process.env.INTERNAL_API_KEY ||
    "ai-service-local-key-change-me"
  );
}

export function isAIServiceRequest(request: NextRequest) {
  const headerKey = request.headers.get("x-ai-service-key");
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

  const provided = headerKey || bearer;
  if (!provided) return false;

  return provided === getAIServiceKey();
}
