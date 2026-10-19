import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { EventLedger } from "./event-ledger.service";
import { requestContext } from "./request-context";
import { randomUUID } from "node:crypto";
import { safeText, safeRoute } from "./safe-data";

export function traceMiddleware(ledger: EventLedger) {
  return (req: any, res: any, next: () => void) => {
    const id = randomUUID(),
      started = Date.now();
    req.requestId = id;
    res.setHeader("X-Request-ID", id);
    requestContext.run({ id, started, request: req }, () => {
      res.on("finish", () => {
        const status = res.statusCode,
          route = safeRoute(req.route?.path);
        if (route.includes("/technical/auth") || route === "/api/v1/health")
          return;
        const input = {
          category:
            status === 401 || status === 403 || status === 429
              ? "security"
              : status >= 500
                ? "error"
                : "audit",
          action: `${req.method} ${route}`,
          result: status >= 400 ? "denied" : "success",
          explanation:
            status >= 500
              ? "Ошибка сервера"
              : status === 403
                ? "Доступ к операции запрещён"
                : status === 401
                  ? "Не подтверждён действующий сеанс"
                  : status === 429
                    ? "Превышено ограничение запросов"
                    : status >= 400
                      ? "Запрос не выполнен"
                      : "Запрос выполнен сервером",
          severity:
            status >= 500 ? "critical" : status >= 400 ? "warning" : "info",
          requestId: id,
          actorId: req.user?.sub,
          actorRole: req.user?.roles?.join(","),
          techActorId: req.tech?.account.id,
          sessionId: req.user?.sid,
          objectType: route.split("/")[3],
          ipAddress: req.ip,
          device: req.headers["user-agent"],
          appVersion:
            typeof req.headers["x-app-version"] === "string"
              ? req.headers["x-app-version"].slice(0, 40)
              : undefined,
          details: {
            method: req.method,
            route,
            statusCode: status,
            durationMs: Date.now() - started,
          },
          problemId: req.problemId,
        };
        if (
          status >= 500 ||
          status === 401 ||
          status === 403 ||
          status === 429
        ) {
          void ledger
            .problem({
              status,
              route,
              method: req.method,
              errorType: req.errorType ?? "HTTP",
              requestId: id,
              details: req.safeError,
            })
            .then((problemId) => ledger.enqueue({ ...input, problemId }))
            .catch(() => ledger.enqueue(input));
        } else ledger.enqueue(input);
      });
      next();
    });
  };
}
@Catch()
@Injectable()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(),
      req = http.getRequest(),
      res = http.getResponse();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    req.errorType = error instanceof Error ? error.name : "UnknownError";
    req.safeError = {
      errorType: req.errorType,
      code:
        typeof (error as any)?.code === "string"
          ? safeText((error as any).code, 30)
          : undefined,
      message:
        status >= 500
          ? "Внутренняя ошибка; исходные данные запроса не сохраняются"
          : safeText(error instanceof Error ? error.message : ""),
      stack:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((x) => /^\s*at /.test(x))
              .slice(0, 6)
              .map((x) => safeText(x, 200))
          : [],
    };
    const response =
      error instanceof HttpException ? error.getResponse() : null;
    let message =
      typeof response === "object" && response !== null
        ? (response as any).message
        : typeof response === "string"
          ? response
          : null;
    if (status >= 500) message = "Не удалось выполнить запрос";
    if (!message) message = "Запрос не выполнен";
    if (Array.isArray(message)) message = "Проверьте введённые данные";
    if (
      [
        "Unauthorized",
        "Forbidden",
        "Bad Request",
        "Not Found",
        "Too Many Requests",
      ].includes(message)
    )
      message =
        (
          {
            401: "Войдите в систему",
            403: "Недостаточно прав",
            400: "Проверьте введённые данные",
            404: "Объект не найден",
            429: "Слишком много запросов. Повторите позже",
          } as any
        )[status] ?? "Запрос не выполнен";
    message = safeText(message, 500);
    if (status >= 500)
      message += ". Номер обращения: " + (req.requestId ?? "не определён");
    res
      .status(status)
      .json({
        statusCode: status,
        message,
        requestId: req.requestId ?? randomUUID(),
      });
  }
}
