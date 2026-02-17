# Corti AI Platform – Live Transcription & Fact-Based Documentation

This guide covers using the **Corti AI Platform** via the [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk) for **live audio transcription** and **fact-based documentation**. It includes two approaches:

1. **Single microphone** – Capturing audio from a single microphone with speaker diarization.
2. **Virtual consultations** – Merging a **local microphone** and a **WebRTC stream** for doctor-patient scenarios.

Both examples follow a **server/client split**: the server handles authentication and sensitive API calls, while the client handles audio capture and streaming.

## Installation

```bash
npm i @corti/sdk
```

---

## Architecture

### Server (`server.ts`)

The server is responsible for:

1. **Creating a `CortiClient`** using OAuth2 client credentials (these must never be exposed to the browser).
2. **Creating an interaction** via the REST API.
3. **Obtaining a scoped stream token** that only grants access to the streaming WebSocket, which is safe to send to the client.

```ts
import { CortiClient, CortiAuth, CortiEnvironment } from "@corti/sdk";
import { randomUUID } from "crypto";

const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
  auth: {
    clientId: "YOUR_CLIENT_ID",
    clientSecret: "YOUR_CLIENT_SECRET",
  },
});

const interaction = await client.interactions.create({
  encounter: {
    identifier: randomUUID(),
    status: "planned",
    type: "first_consultation",
  },
});

const auth = new CortiAuth({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
});

const streamToken = await auth.getToken({
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  scopes: ["stream"],
});

// Send interaction.id and streamToken.accessToken to the client
```

### Client (`client.ts`)

The client receives the scoped token and interaction ID, then:

1. **Creates a `CortiClient`** with the scoped access token.
2. **Connects to the stream** via `client.stream.connect()`.
3. **Captures and sends audio** using `MediaRecorder`.
4. **Handles transcript and fact events** from the stream.

```ts
import { CortiClient, CortiEnvironment } from "@corti/sdk";

const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
  auth: {
    accessToken: streamToken.accessToken, // Token with "stream" scope
  },
});

// This will work – stream is within the token's scope
const streamSocket = await client.stream.connect({ id: interactionId });

// This would fail – outside the token's scope:
// await client.transcribe.connect({ id: "..." }); // Error
// await client.interactions.list();                // Error
```

---

## 1. Single Microphone

**Files:** `singleMicrophone/server.ts`, `singleMicrophone/client.ts`, `singleMicrophone/audio.ts`, `singleMicrophone/index.html`

Uses a single audio source with **speaker diarization** to automatically distinguish multiple speakers.

### Audio Capture (`audio.ts`)

Exposes `getMicrophoneStream()` to access the user's microphone:

```ts
const microphoneStream = await getMicrophoneStream();
```

### Streaming & Events (`client.ts`)

```ts
const streamSocket = await client.stream.connect({ id: interactionId });

const microphoneStream = await getMicrophoneStream();
const mediaRecorder = new MediaRecorder(microphoneStream);
mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    streamSocket.send(event.data);
  }
};
mediaRecorder.start(200);

streamSocket.on("transcript", (data) => console.log("Transcript:", data));
streamSocket.on("fact", (data) => console.log("Fact:", data));
```

### Cleanup

```ts
mediaRecorder.stop();
microphoneStream.getAudioTracks().forEach((track) => track.stop());
streamSocket.close();
```

---

## 2. Virtual Consultations

**Files:** `virtualConsultations/server.ts`, `virtualConsultations/client.ts`, `virtualConsultations/audio.ts`, `virtualConsultations/index.html`

Merges two separate audio streams — a **local microphone** (doctor) and a **WebRTC stream** (patient) — into a single multi-channel stream.

### Audio Capture (`audio.ts`)

Exposes two methods, each returning a `MediaStream`:

```ts
// Local microphone
const microphoneStream = await getMicrophoneStream();

// Remote participant from WebRTC
const remoteStream = getRemoteParticipantStream(peerConnection);
```

### Merging Streams (`client.ts`)

The two streams are merged into a single multi-channel stream where each input maps to a separate channel (channel 0 = doctor, channel 1 = patient):

```ts
function mergeMediaStreams(mediaStreams: MediaStream[]) {
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const channelMerger = audioContext.createChannelMerger(mediaStreams.length);

  mediaStreams.forEach((stream, index) => {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(channelMerger, 0, index);
  });
  channelMerger.connect(audioDestination);

  return {
    stream: audioDestination.stream,
    endStream: () => {
      audioDestination.stream.getAudioTracks().forEach((track) => track.stop());
      audioContext.close();
    },
  };
}
```

### Streaming & Events (`client.ts`)

```ts
const { stream: mergedStream, endStream } = mergeMediaStreams([
  microphoneStream,
  remoteStream,
]);

const streamSocket = await client.stream.connect({ id: interactionId });

const mediaRecorder = new MediaRecorder(mergedStream);
mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    streamSocket.send(event.data);
  }
};
mediaRecorder.start(200);

streamSocket.on("transcript", (data) => console.log("Transcript:", data));
streamSocket.on("fact", (data) => console.log("Fact:", data));
```

### Cleanup

```ts
mediaRecorder.stop();
endStream();
microphoneStream.getAudioTracks().forEach((track) => track.stop());
remoteStream.getAudioTracks().forEach((track) => track.stop());
streamSocket.close();
```

---

## File Structure

```
AmbientScribe/
  README.md
  singleMicrophone/
    server.ts     # Auth, interaction creation, scoped token
    client.ts     # Stream connection, audio send, event handling
    audio.ts      # getMicrophoneStream()
    index.html    # Minimal page (output goes to console)
  virtualConsultations/
    server.ts     # Auth, interaction creation, scoped token
    client.ts     # Stream connection, merged audio, event handling
    audio.ts      # getMicrophoneStream(), getRemoteParticipantStream()
    index.html    # Minimal page (output goes to console)
```

## Resources

- [`@corti/sdk` on npm](https://www.npmjs.com/package/@corti/sdk)
- [Corti API documentation](https://docs.corti.ai)
