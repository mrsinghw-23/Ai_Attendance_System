import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";

const agents = new Map<string, https.Agent | http.Agent>();

function getAgent(url: string) {
  const key = url.startsWith("https") ? "https" : "http";
  let agent = agents.get(key);
  if (!agent) {
    agent =
      key === "https"
        ? new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 8 })
        : new http.Agent({ keepAlive: true, maxSockets: 8 });
    agents.set(key, agent);
  }
  return agent;
}

function md5(value: string) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function parseDigestChallenge(header: string) {
  const params: Record<string, string> = {};
  const body = header.replace(/^Digest\s+/i, "");
  for (const part of body.split(",")) {
    const match = part.trim().match(/^(\w+)="?([^"]+)"?$/);
    if (match) params[match[1]] = match[2];
  }
  return params;
}

function buildDigestAuthorization(
  challenge: Record<string, string>,
  username: string,
  password: string,
  method: string,
  uri: string
) {
  const realm = challenge.realm ?? "";
  const nonce = challenge.nonce ?? "";
  const qop = challenge.qop?.split(",")[0]?.trim();
  const opaque = challenge.opaque;
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (opaque) parts.push(`opaque="${opaque}"`);
  return `Digest ${parts.join(", ")}`;
}

type RawResponse = {
  status: number;
  body: Buffer;
  wwwAuth: string | null;
};

function rawGet(url: string, headers: Record<string, string>): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        agent: getAgent(url),
        headers: { Accept: "image/jpeg,image/*,*/*", ...headers },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            wwwAuth: res.headers["www-authenticate"]?.toString() ?? null,
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

export async function fetchWithDigestAuth(
  url: string,
  username: string,
  password: string
): Promise<Buffer | null> {
  try {
    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    const first = await rawGet(url, { Authorization: `Basic ${basic}` });
    if (first.status === 200 && first.body.length > 256) return first.body;

    if (first.status !== 401 || !first.wwwAuth?.toLowerCase().includes("digest")) {
      return first.status === 200 ? first.body : null;
    }

    const parsed = new URL(url);
    const uri = `${parsed.pathname}${parsed.search}`;
    const challenge = parseDigestChallenge(first.wwwAuth);
    const auth = buildDigestAuthorization(challenge, username, password, "GET", uri);
    const second = await rawGet(url, { Authorization: auth });
    return second.status === 200 && second.body.length > 256 ? second.body : null;
  } catch {
    return null;
  }
}
