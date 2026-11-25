const BASE = process.env.APP_URL || "http://localhost:3000";
const SERVICE_KEY =
  process.env.AI_SERVICE_API_KEY ||
  process.env.INTERNAL_API_KEY ||
  "ai-service-local-key-change-me";

async function main() {
  const date = process.env.REPORT_DATE || "";
  const response = await fetch(`${BASE}/api/reports/generate-daily`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-service-key": SERVICE_KEY,
    },
    body: JSON.stringify(date ? { date } : {}),
  });

  const data = await response.json();
  if (!data.success) {
    console.error("Daily report generation failed:", data.message);
    process.exit(1);
  }

  console.log("Daily reports generated:", data.data);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
