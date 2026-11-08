export function safePostAuthPath(value: string | null | undefined): string {
  return value === "/batches/new" ? value : "/dashboard";
}
