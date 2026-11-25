export interface ImageDimensions {
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp" | "unknown";
}

export function getImageDimensions(buffer: Buffer): ImageDimensions {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      format: "png",
    };
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
          format: "jpeg",
        };
      }
      offset += 2 + length;
    }
  }

  if (
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return {
      width: buffer.readUInt16LE(26) + 1,
      height: buffer.readUInt16LE(28) + 1,
      format: "webp",
    };
  }

  return { width: 0, height: 0, format: "unknown" };
}

export function estimateBrightness(buffer: Buffer) {
  let sum = 0;
  const step = Math.max(1, Math.floor(buffer.length / 5000));
  let count = 0;

  for (let i = 0; i < buffer.length; i += step) {
    sum += buffer[i];
    count++;
  }

  return count > 0 ? sum / count / 255 : 0;
}

export function estimateBlurScore(buffer: Buffer) {
  let variance = 0;
  const step = Math.max(1, Math.floor(buffer.length / 8000));
  let prev = buffer[0] || 0;
  let count = 0;
  let mean = 0;

  for (let i = step; i < buffer.length; i += step) {
    const diff = Math.abs(buffer[i] - prev);
    mean += diff;
    count++;
    prev = buffer[i];
  }

  if (count === 0) return 0;
  mean /= count;

  prev = buffer[0] || 0;
  for (let i = step; i < buffer.length; i += step) {
    const diff = Math.abs(buffer[i] - prev);
    variance += (diff - mean) ** 2;
    prev = buffer[i];
  }

  return variance / count;
}
