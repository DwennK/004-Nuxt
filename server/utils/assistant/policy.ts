export function assistantSqlDebugRequiresAdmin(
  debugRequested: boolean,
  isDevelopment = import.meta.dev
) {
  return debugRequested && !isDevelopment
}
