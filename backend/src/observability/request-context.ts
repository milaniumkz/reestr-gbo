import { requestLocation } from "./request-location";
import { AsyncLocalStorage } from "node:async_hooks";
export type TraceState = { id: string; started: number; request: any };
export const requestContext = new AsyncLocalStorage<TraceState>();
export function traceFields() {
  const c = requestContext.getStore();
  return c
    ? {
        requestId: c.id,
        location: requestLocation(c.request.headers),
        sessionId: c.request.user?.sid ?? c.request.accountContext?.sessionId,
        appVersion:
          typeof c.request.headers?.["x-app-version"] === "string"
            ? c.request.headers["x-app-version"].slice(0, 40)
            : undefined,
      }
    : {};
}
