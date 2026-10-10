const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const internalUrl = process.env.SUPABASE_INTERNAL_URL?.replace(/\/$/, "");

/**
 * Keep the public project URL for Supabase's cookie storage key, while routing
 * server-side requests over the Docker network instead of through FRP.
 */
export const supabaseServerFetch: typeof fetch = (input, init) => {
  if (!publicUrl || !internalUrl) return fetch(input, init);

  const requestedUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  if (!requestedUrl.startsWith(`${publicUrl}/`)) return fetch(input, init);

  const targetUrl = `${internalUrl}${requestedUrl.slice(publicUrl.length)}`;
  if (input instanceof Request) {
    return fetch(new Request(targetUrl, input), init);
  }
  return fetch(targetUrl, init);
};
