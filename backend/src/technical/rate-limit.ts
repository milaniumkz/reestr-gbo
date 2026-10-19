import { HttpException } from "@nestjs/common";
import { digest } from "../observability/safe-data";
export async function enforceRateLimit(
  prisma: any,
  key: string,
  max: number,
  seconds: number,
) {
  const bucket = Math.floor(Date.now() / (seconds * 1000)),
    hash = digest(`${key}:${bucket}`);
  const row = await prisma.technicalRateLimit.upsert({
    where: { key: hash },
    create: { key: hash, expiresAt: new Date((bucket + 1) * seconds * 1000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max)
    throw new HttpException("Слишком много попыток. Повторите позже", 429);
}
