export type CpPlusHttpInput = {
  host: string;
  httpPort?: number;
  channel?: number;
};

export function buildCpPlusSnapshotUrl(input: CpPlusHttpInput): string {
  const host = input.host.trim();
  const httpPort = input.httpPort ?? 80;
  const channel = input.channel ?? 1;
  return `http://${host}:${httpPort}/cgi-bin/snapshot.cgi?channel=${channel}`;
}

export function buildCpPlusOnvifSnapshotUrl(
  input: CpPlusHttpInput & { subtype?: number; httpsPort?: number }
): string {
  const host = input.host.trim();
  const httpsPort = input.httpsPort ?? 443;
  const channel = input.channel ?? 1;
  const subtype = input.subtype ?? 0;
  return `https://${host}:${httpsPort}/onvifsnapshot/media_service/snapshot?channel=${channel}&subtype=${subtype}`;
}

export function isJpegBuffer(data: Buffer): boolean {
  return data.length > 2 && data[0] === 0xff && data[1] === 0xd8;
}
