/** Resolve a principal from the host application's verified authentication context. */
export type PrincipalIdResolver = (
  request: Request,
) => string | undefined | Promise<string | undefined>;

export const DEFAULT_USER_ID = "default-user";

export async function resolvePrincipalId(
  request: Request,
  resolver?: PrincipalIdResolver,
): Promise<string | undefined> {
  if (resolver) {
    return resolver(request);
  }
  // Default header-based resolver for host/gateway/UI integration
  const header = request.headers.get("x-user-id") ?? request.headers.get("x-principal-id");
  if (header && header.trim().length > 0) {
    return header.trim();
  }
  return undefined;
}
