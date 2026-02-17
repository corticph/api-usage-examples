import { CortiClient, CortiAuth, CortiEnvironment } from "@corti/sdk";
import { randomUUID } from "crypto";

// Server-side: handles authentication and sensitive API calls.
// Client credentials must NEVER be exposed to the browser.

const TENANT_NAME = "YOUR_TENANT_NAME";
const CLIENT_ID = "YOUR_CLIENT_ID";
const CLIENT_SECRET = "YOUR_CLIENT_SECRET";

// 1. Create Corti client with client credentials (OAuth2)
const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: TENANT_NAME,
  auth: {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  },
});

// 2. Create an interaction
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

// 3. Get a scoped token for WebSocket streaming (stream scope only).
//    This token can safely be sent to the client since it only grants
//    access to the streaming endpoint, not the full API.
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

// Example: Express endpoint that provides the client with an interaction ID + scoped token
//
// app.post("/api/start-session", async (req, res) => {
//   const interaction = await createInteraction();
//   const streamToken = await getScopedStreamToken();
//   res.json({
//     interactionId: interaction.id,
//     accessToken: streamToken.accessToken,
//   });
// });

export { createInteraction, getScopedStreamToken };
