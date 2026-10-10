export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/";
  return value;
}

export function loginPath(next: string) {
  return `/auth?next=${encodeURIComponent(safeReturnPath(next))}`;
}
