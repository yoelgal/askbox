import { createOAuthCallbackPageHandler } from "@fanvue/builder-sdk/nextjs/embedded-app";

// Registered with Fanvue because OAuth requires a redirect URI, but an embedded
// app never sends a browser here: the code exchange happens server-side.
export const GET = createOAuthCallbackPageHandler("Askbox");
