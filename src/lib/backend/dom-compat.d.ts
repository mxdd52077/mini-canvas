// The app shares browser DOM and Worker types. Preserve the standard DOM Body.json()
// signature; application boundaries validate incoming payloads with Zod.
interface Body {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): Promise<any>;
}
