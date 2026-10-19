import { requestContext } from "./request-context";
/** Server-resolved account reference only. Never copy credentials or claimed raw identifiers. */
export function accountContext(input: {
  actorId?: string;
  techActorId?: string;
  verified: boolean;
  requestedRole?: string;
  organizationId?: string;
  reasonCode?: string;
  sessionId?: string;
}) {
  const request = requestContext.getStore()?.request;
  if (request) request.accountContext = { ...request.accountContext, ...input };
}
