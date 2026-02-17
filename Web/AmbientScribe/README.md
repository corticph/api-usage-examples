# Corti AI Platform – Live Transcription & Fact-Based Documentation

A single demo app using the [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk) for **live audio transcription** and **fact-based documentation**. Toggle between two modes from the UI:

- **Single Microphone** – one audio source with automatic speaker diarization.
- **Virtual Consultation** – local microphone (doctor) + WebRTC stream (patient) merged into a multi-channel stream.

The demo is split into **server** (auth, interaction management) and **client** (audio capture, streaming, event display).

## Installation

```bash
npm i @corti/sdk
```

---

## File Structure

```
AmbientScribe/
  server.ts      # Server-side: OAuth2 auth, interaction creation, scoped token
  client.ts      # Client-side: stream connection, audio capture, event handling
  audio.ts       # Audio utilities: getMicrophoneStream(), getRemoteParticipantStream(), mergeMediaStreams()
  index.html     # Minimal UI with mode toggle (output goes to console)
  README.md
```

---

## Server (`server.ts`)

Runs on your backend. Responsible for:

1. **Creating a `CortiClient`** with OAuth2 client credentials (never exposed to the browser).
2. **Creating an interaction** via the REST API.
3. **Minting a scoped stream token** (only grants WebSocket streaming access).

```ts
import { CortiClient, CortiAuth, CortiEnvironment } from "@corti/sdk";

// Full-privilege client — server-side only
const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
  auth: { clientId: "YOUR_CLIENT_ID", clientSecret: "YOUR_CLIENT_SECRET" },
});

// Create an interaction
const interaction = await client.interactions.create({
  encounter: { identifier: randomUUID(), status: "planned", type: "first_consultation" },
});

// Mint a token scoped to streaming only
const auth = new CortiAuth({ environment: CortiEnvironment.Eu, tenantName: "YOUR_TENANT_NAME" });
const streamToken = await auth.getToken({
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  scopes: ["stream"],
});

// Send interaction.id + streamToken.accessToken to the client
```

---

## Audio Utilities (`audio.ts`)

Two methods for obtaining audio streams, plus a merge utility:

```ts
// 1. Local microphone
const micStream = await getMicrophoneStream();

// 2. Remote participant from a WebRTC peer connection
const remoteStream = getRemoteParticipantStream(peerConnection);

// 3. Merge into a single multi-channel stream (virtual consultation mode)
const { stream, endStream } = mergeMediaStreams([micStream, remoteStream]);
```

---

## Client (`client.ts`)

Receives the scoped token + interaction ID from the server, then:

1. Creates a `CortiClient` with the stream-scoped token.
2. Connects via `client.stream.connect()`.
3. Acquires audio — just the mic in single mode, or mic + remote merged in virtual mode.
4. Streams audio in 200 ms chunks via `MediaRecorder`.
5. Logs transcript and fact events to the console.

```ts
const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
  auth: { accessToken },  // stream scope only
});

const streamSocket = await client.stream.connect({ id: interactionId });

// With a stream-scoped token, only streaming works:
// await client.interactions.list();  // Error — outside scope
// await client.transcribe.connect(); // Error — outside scope
```

### Single Microphone Mode

```ts
const microphoneStream = await getMicrophoneStream();
const mediaRecorder = new MediaRecorder(microphoneStream);
mediaRecorder.ondataavailable = (e) => streamSocket.send(e.data);
mediaRecorder.start(200);
```

### Virtual Consultation Mode

```ts
const microphoneStream = await getMicrophoneStream();
const remoteStream = getRemoteParticipantStream(peerConnection);

// channel 0 = doctor, channel 1 = patient
const { stream, endStream } = mergeMediaStreams([microphoneStream, remoteStream]);

const mediaRecorder = new MediaRecorder(stream);
mediaRecorder.ondataavailable = (e) => streamSocket.send(e.data);
mediaRecorder.start(200);
```

### Event Handling

```ts
streamSocket.on("transcript", (data) => console.log("Transcript:", data));
streamSocket.on("fact", (data) => console.log("Fact:", data));
```

---

## UI (`index.html`)

A minimal page with:

- Radio buttons to toggle between **Single Microphone** and **Virtual Consultation** mode.
- **Start Call** / **End Call** buttons.
- All output goes to the browser console.

---

## Resources

- [`@corti/sdk` on npm](https://www.npmjs.com/package/@corti/sdk)
- [Corti API documentation](https://docs.corti.ai)
