/**
 * server.ts — Server-side setup for AmbientScribe.
 *
 * Runs on your backend (Node.js / Express / etc.).  Responsible for:
 *   1. Creating a fully-privileged CortiClient using OAuth2 client credentials.
 *   2. Creating an interaction via the REST API.
 *   3. Minting a scoped stream token that can be safely sent to the browser.
 *
 * IMPORTANT: Client credentials (CLIENT_ID / CLIENT_SECRET) must NEVER be
 * exposed to the browser.  Only the scoped stream token is sent to the client.
 */

import { CortiClient, CortiAuth, CortiEnvironment } from "@corti/sdk";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Configuration — replace with your own values or load from environment
// ---------------------------------------------------------------------------

const TENANT_NAME = "YOUR_TENANT_NAME";
const CLIENT_ID = "YOUR_CLIENT_ID";
const CLIENT_SECRET = "YOUR_CLIENT_SECRET";

// ---------------------------------------------------------------------------
// 1. Create a CortiClient authenticated with client credentials (OAuth2).
//    This client has full API access and must only be used server-side.
// ---------------------------------------------------------------------------

const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: TENANT_NAME,
  auth: {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  },
});

// ---------------------------------------------------------------------------
// 2. Create an interaction.
//    An interaction represents a single clinical encounter / session.
// ---------------------------------------------------------------------------

async function createInteraction() {
  const interaction = await client.interactions.create({
    encounter: {
      identifier: randomUUID(),
      status: "planned",
      type: "first_consultation",
    },
  });

  console.log("Interaction created:", interaction.id);
  return interaction;
}

// ---------------------------------------------------------------------------
// 3. Mint a scoped token with only the "stream" scope.
//    This token lets the client connect to the streaming WebSocket but
//    cannot list interactions, create documents, or call any other REST
//    endpoint — keeping the blast radius minimal if it leaks.
// ---------------------------------------------------------------------------

async function getScopedStreamToken() {
  const auth = new CortiAuth({
    environment: CortiEnvironment.Eu,
    tenantName: TENANT_NAME,
  });

  const streamToken = await auth.getToken({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    scopes: ["stream"],
  });

  return streamToken;
}

// ---------------------------------------------------------------------------
// Example: Express endpoint that hands the client everything it needs
// ---------------------------------------------------------------------------
//
// app.post("/api/start-session", async (req, res) => {
//   const interaction = await createInteraction();
//   const streamToken = await getScopedStreamToken();
//
//   // The client only receives the interaction ID and a limited-scope token.
//   res.json({
//     interactionId: interaction.id,
//     accessToken: streamToken.accessToken,
//   });
// });

export { createInteraction, getScopedStreamToken };
