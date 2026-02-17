/**
 * server.ts — Express server for AmbientScribe.
 *
 * Responsible for:
 *   1. Creating a fully-privileged CortiClient using OAuth2 client credentials.
 *   2. Exposing a POST /api/start-session endpoint that:
 *        a. Creates an interaction via the Corti REST API.
 *        b. Mints a scoped stream token (WebSocket access only).
 *        c. Returns both to the client.
 *   3. Serving the static front-end files (index.html, client.ts, audio.ts).
 *
 * IMPORTANT: Client credentials (CLIENT_ID / CLIENT_SECRET) must NEVER be
 * exposed to the browser.  Only the scoped stream token is sent to the client.
 */

import express from "express";
import path from "path";
import { CortiClient, CortiAuth, CortiEnvironment } from "@corti/sdk";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Configuration — replace with your own values or load from environment
// ---------------------------------------------------------------------------

const TENANT_NAME = process.env.CORTI_TENANT_NAME ?? "YOUR_TENANT_NAME";
const CLIENT_ID = process.env.CORTI_CLIENT_ID ?? "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.CORTI_CLIENT_SECRET ?? "YOUR_CLIENT_SECRET";
const PORT = Number(process.env.PORT ?? 3000);

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
// 2. Helper: create an interaction.
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
// 3. Helper: mint a scoped token with only the "stream" scope.
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
// 4. Express app
// ---------------------------------------------------------------------------

const app = express();

// Serve the front-end files (index.html, client.ts, audio.ts) from this directory.
app.use(express.static(path.join(__dirname)));

// POST /api/start-session
// Creates an interaction + scoped token and returns them to the client.
app.post("/api/start-session", async (_req, res) => {
  try {
    const interaction = await createInteraction();
    const streamToken = await getScopedStreamToken();

    // The client only receives the interaction ID and a limited-scope token.
    res.json({
      interactionId: interaction.id,
      accessToken: streamToken.accessToken,
    });
  } catch (err) {
    console.error("Failed to start session:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

app.listen(PORT, () => {
  console.log(`AmbientScribe server listening on http://localhost:${PORT}`);
});
