/**
 * Everything about email that both halves of the app are allowed to see.
 *
 * `send.ts` is deliberately not re-exported here. It holds the provider key and
 * a `fetch` to a third party, and a barrel is the easiest way there is to drag
 * a server-only module into a browser bundle by accident — one component
 * imports `@/lib/email` for a template type, and the transport comes with it.
 * Server code reaches for `@/lib/email/send` by name, so crossing that boundary
 * is something you have to type rather than something you inherit.
 */
export * from "./templates";
