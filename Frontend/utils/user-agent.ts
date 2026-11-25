export function parseUserAgent(userAgent: string | null | undefined) {
  const ua = userAgent || "Unknown";

  let browser = "Unknown Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  let device = "Desktop";
  if (/Mobile|Android|iPhone/i.test(ua)) device = "Mobile";
  else if (/Tablet|iPad/i.test(ua)) device = "Tablet";

  return { browser, device };
}
