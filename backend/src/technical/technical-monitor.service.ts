import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { PhotoModerationService } from "../photo-moderation/photo-moderation.service";
import { cpus, freemem, totalmem, uptime, loadavg } from "node:os";
import { readFile, statfs, access } from "node:fs/promises";
import { constants } from "node:fs";
import Redis from "ioredis";

@Injectable()
export class TechnicalMonitor {
  private cached: any;
  private expires = 0;
  private inFlight?: Promise<any>;
  private previousCpu?: { idle: number; total: number; at: number };
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
    private readonly photo: PhotoModerationService,
  ) {}
  async snapshot() {
    if (this.cached && Date.now() < this.expires) return this.cached;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.collect();
    try {
      this.cached = await this.inFlight;
      this.expires = Date.now() + 15000;
      return this.cached;
    } finally {
      this.inFlight = undefined;
    }
  }
  private async collect() {
    const observedAt = new Date().toISOString();
    const system = cpus().reduce(
      (a, c) => {
        a.idle += c.times.idle;
        a.total += Object.values(c.times).reduce((x, y) => x + y, 0);
        return a;
      },
      { idle: 0, total: 0 },
    );
    const previous = this.previousCpu;
    const cpu =
      previous && system.total > previous.total
        ? 100 *
          (1 - (system.idle - previous.idle) / (system.total - previous.total))
        : null;
    this.previousCpu = { ...system, at: Date.now() };
    let disk: any = {
      state: "unknown",
      explanation: "Нет данных о файловой системе",
    };
    try {
      const fs = await statfs(process.env.LOCAL_STORAGE_PATH ?? process.cwd());
      disk = {
        state: "connected",
        totalBytes: Number(fs.blocks) * Number(fs.bsize),
        availableBytes: Number(fs.bavail) * Number(fs.bsize),
        observedAt,
      };
    } catch {}
    let database: any = {
      state: "unavailable",
      explanation: "Не удалось проверить подключение к базе",
    };
    const dbStart = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = {
        state: "connected",
        latencyMs: Math.round(performance.now() - dbStart),
        observedAt,
      };
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ connections: bigint; longQueries: bigint }>
        >`SELECT count(*) as connections,count(*) FILTER (WHERE state='active' AND query_start<now()-interval '30 seconds' AND pid<>pg_backend_pid()) as "longQueries" FROM pg_stat_activity WHERE datname=current_database()`;
        database.connections = Number(rows[0].connections);
        database.longQueries = Number(rows[0].longQueries);
      } catch {
        database.statistics = "Нет прав на статистику";
      }
    } catch {}
    let storage: any = {
      state: "not_connected",
      explanation: "Проверка хранилища не подключена",
    };
    if (process.env.STORAGE_DRIVER === "local") {
      try {
        await access(
          process.env.LOCAL_STORAGE_PATH ?? "/opt/reestr/storage",
          constants.R_OK | constants.W_OK,
        );
        storage = {
          state: "connected",
          explanation:
            "Каталог доступен для чтения и записи; запись тестовых документов не выполнялась",
          observedAt,
        };
      } catch {
        storage = {
          state: "unavailable",
          explanation: "Каталог хранилища недоступен для проверки",
          observedAt,
        };
      }
    }
    let redis: any = {
      state: "not_connected",
      explanation:
        "Источник Redis не настроен; рабочих обработчиков BullMQ в проекте нет",
    };
    if (process.env.REDIS_URL) {
      const client = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1500,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      client.on("error", () => undefined);
      try {
        await client.connect();
        await client.ping();
        redis = {
          state: "connected",
          explanation:
            "Redis отвечает. Фоновые обработчики BullMQ не зарегистрированы",
          observedAt,
        };
      } catch {
        redis = {
          state: "unavailable",
          explanation: "Проверка соединения Redis не прошла",
          observedAt,
        };
      } finally {
        client.disconnect();
      }
    }
    let host: any = {
      state: "not_connected",
      explanation: "Серверный сборщик ещё не подключён",
    };
    try {
      const path =
        process.env.TECH_MONITOR_STATE_PATH ?? "/opt/reestr/monitor/state.json";
      const raw = await readFile(path, "utf8");
      if (raw.length > 512000) throw new Error();
      const value = JSON.parse(raw);
      if (
        value.schemaVersion !== 1 ||
        !Number.isFinite(Date.parse(value.observedAt))
      )
        throw new Error();
      const age = Date.now() - Date.parse(value.observedAt);
      const stale = age > 180000 || age < -60000;
      host = { ...value, state: stale ? "stale" : "connected", stale };
    } catch {}
    let version: string | null = null;
    try {
      version = (
        await readFile(
          process.env.TECH_VERSION_PATH ?? "/opt/reestr/app/VERSION",
          "utf8",
        )
      )
        .trim()
        .slice(0, 64);
    } catch {}
    const ledger = this.ledger.status();
    return {
      observedAt,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      application: {
        state: "connected",
        processUptimeSeconds: Math.floor(process.uptime()),
        version,
        observedAt,
      },
      server: {
        cpuPercent: cpu,
        memoryTotalBytes: totalmem(),
        memoryFreeBytes: freemem(),
        processMemoryBytes: process.memoryUsage().rss,
        uptimeSeconds: uptime(),
        loadAverage: loadavg(),
        observedAt,
      },
      disk,
      database,
      storage,
      redis,
      photo: { state: "connected", ...this.photo.status(), observedAt },
      collector: host,
      eventCollection: {
        ...ledger,
        state:
          ledger.dropped || ledger.failures
            ? "attention"
            : ledger.lastSuccess
              ? "connected"
              : "no_data",
      },
      antivirus: {
        state: "not_connected",
        explanation: "Антивирусный сканер не подключён",
      },
      ipGeography: {
        state: "not_connected",
        explanation: "Определение географии по IP не подключено",
      },
      externalNotifications: {
        state: "not_connected",
        explanation: "Внешние каналы доставки не согласованы и не подключены",
      },
    };
  }
}
