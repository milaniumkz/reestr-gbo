import { periodic } from "./local-photo-analysis";

export type ScreenEvidence = {
  enclosedDisplay: boolean;
  coherentBands: boolean;
  colorBands: boolean;
};

/** Conservative enclosure test: a light, rectangular connected area surrounded on ALL four sides by a dark bezel. */
function enclosedDisplay(gray: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(gray.length),
    queue = new Int32Array(gray.length);
  for (let start = 0; start < gray.length; start++) {
    if (seen[start] || gray[start] < 120) continue;
    let head = 0,
      tail = 1,
      minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      // Avoid allocating a neighbours array for every visited pixel.
      if (x > 0 && !seen[i - 1] && gray[i - 1] >= 120) {
        seen[i - 1] = 1;
        queue[tail++] = i - 1;
      }
      if (x < width - 1 && !seen[i + 1] && gray[i + 1] >= 120) {
        seen[i + 1] = 1;
        queue[tail++] = i + 1;
      }
      if (y > 0 && !seen[i - width] && gray[i - width] >= 120) {
        seen[i - width] = 1;
        queue[tail++] = i - width;
      }
      if (y < height - 1 && !seen[i + width] && gray[i + width] >= 120) {
        seen[i + width] = 1;
        queue[tail++] = i + width;
      }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1,
      area = w * h;
    if (
      area < gray.length * 0.08 ||
      area > gray.length * 0.9 ||
      tail / area < 0.65 ||
      w < 50 ||
      h < 50
    )
      continue;
    const pad = Math.max(3, Math.round(Math.min(w, h) * 0.035));
    if (minX < pad || minY < pad || maxX + pad >= width || maxY + pad >= height)
      continue;
    const sides = [0, 0, 0, 0],
      counts = [0, 0, 0, 0];
    for (let d = 1; d <= pad; d++) {
      for (let x = minX + pad; x <= maxX - pad; x++) {
        counts[0]++;
        counts[1]++;
        if (gray[(minY - d) * width + x] < 65) sides[0]++;
        if (gray[(maxY + d) * width + x] < 65) sides[1]++;
      }
      for (let y = minY + pad; y <= maxY - pad; y++) {
        counts[2]++;
        counts[3]++;
        if (gray[y * width + minX - d] < 65) sides[2]++;
        if (gray[y * width + maxX + d] < 65) sides[3]++;
      }
    }
    if (sides.every((dark, i) => dark / counts[i] > 0.8))
      return { x: minX, y: minY, width: w, height: h };
  }
  return false;
}

/** Check local patches at several directions: averaging the whole photo misses a small or tilted display. */
export function screenEvidence(
  rgb: Uint8Array,
  width: number,
  height: number,
): ScreenEvidence {
  if (rgb.length !== width * height * 3) throw new Error("Expected RGB raster");
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.round(
      0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2],
    );
  // The eligibility mask is independent of projection direction and patch location.
  const eligible = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < 100) continue;
    if (
      i > width &&
      i < gray.length - width &&
      Math.abs(gray[i + 1] - gray[i - 1]) +
        Math.abs(gray[i + width] - gray[i - width]) >
        20
    )
      continue;
    eligible[i] = 1;
  }
  const enclosure = enclosedDisplay(gray, width, height);
  const enclosed = !!enclosure;
  const region = enclosure || { x: 0, y: 0, width, height };
  let coherentBands = false,
    colorBands = false;
  // Four overlapping centre patches. At least three must support the same direction/channel.
  const size = Math.floor(Math.min(region.width, region.height) * 0.42);
  for (let direction = 0; direction < 18; direction++) {
    const angle = (direction * Math.PI) / 18;
    let luminanceVotes = 0,
      chromaVotes = 0;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    // Reuse one projection geometry across all four patches.
    const bins = new Int16Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        bins[y * size + x] =
          Math.round((x - size / 2) * cos + (y - size / 2) * sin) + size;
    for (const [cx, cy] of [
      [0.38, 0.38],
      [0.62, 0.38],
      [0.38, 0.62],
      [0.62, 0.62],
    ]) {
      const count = Array<number>(size * 2 + 1).fill(0),
        luma = Array<number>(size * 2 + 1).fill(0),
        chroma = Array<number>(size * 2 + 1).fill(0);
      const x0 = Math.round(region.x + region.width * cx - size / 2),
        y0 = Math.round(region.y + region.height * cy - size / 2);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y + y0) * width + x + x0;
          if (!eligible[i]) continue;
          const bin = bins[y * size + x];
          count[bin]++;
          luma[bin] += gray[i];
          chroma[bin] += rgb[i * 3] - rgb[i * 3 + 1];
        }
      const usable = count
        .map((n, i) => ({
          n,
          l: luma[i] / Math.max(1, n),
          c: chroma[i] / Math.max(1, n),
        }))
        .filter((v) => v.n >= size * 0.35);
      if (
        periodic(
          usable.map((v) => v.l),
          0.82,
          0.25,
        )
      )
        luminanceVotes++;
      if (
        periodic(
          usable.map((v) => v.c),
          0.82,
          0.25,
        )
      )
        chromaVotes++;
    }
    if (luminanceVotes >= 3) coherentBands = true;
    if (chromaVotes >= 3) colorBands = true;
    // Both output flags are monotonic; later directions cannot add information.
    if (coherentBands && colorBands) break;
  }
  return { enclosedDisplay: enclosed, coherentBands, colorBands };
}

export function shouldReshoot(e: ScreenEvidence, type: string) {
  // A dashboard screen incidental to a vehicle photo is not grounds for refusal.
  return (
    type !== "vehicle_photo" &&
    e.enclosedDisplay &&
    (e.coherentBands || e.colorBands)
  );
}
