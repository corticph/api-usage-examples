import { CortiClient, CortiEnvironment } from "@corti/sdk";
import { getMicrophoneStream } from "./audio";

// Client-side: receives a scoped token and interaction ID from the server,
// then connects to the Corti streaming API to send audio and receive
// real-time transcripts and facts.

async function startSession(accessToken: string, interactionId: string) {
  // 1. Create client with scoped token (stream scope only)
  const client = new CortiClient({
    environment: CortiEnvironment.Eu,
    tenantName: "YOUR_TENANT_NAME",
    auth: {
      accessToken: accessToken, // Token with "stream" scope
    },
  });

  // Note: with a stream-scoped token, only streaming operations are allowed.
  // await client.interactions.list();  // Would fail - outside token scope
  // await client.transcribe.connect(); // Would fail - outside token scope

  // 2. Connect to the stream
  const streamSocket = await client.stream.connect({ id: interactionId });

  // 3. Get microphone audio
  const microphoneStream = await getMicrophoneStream();

  // 4. Send audio data via MediaRecorder in 200ms chunks
  const mediaRecorder = new MediaRecorder(microphoneStream);
  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      streamSocket.send(event.data);
    }
  };
  mediaRecorder.start(200);

  // 5. Handle incoming events
  streamSocket.on("transcript", (data) => {
    console.log("Transcript:", data);
  });

  streamSocket.on("fact", (data) => {
    console.log("Fact:", data);
  });

  console.log("Streaming started for interaction:", interactionId);

  // 6. Return cleanup function
  return {
    endCall: () => {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
      streamSocket.close();
      console.log("Call ended and resources cleaned up.");
    },
  };
}

// --- Usage ---

async function main() {
  // Fetch session credentials from your server
  const response = await fetch("/api/start-session", { method: "POST" });
  const { interactionId, accessToken } = await response.json();

  const { endCall } = await startSession(accessToken, interactionId);

  // Wire up the end call button
  document.getElementById("end-call")?.addEventListener("click", () => {
    endCall();
    (document.getElementById("end-call") as HTMLButtonElement).disabled = true;
  });
}

main().catch(console.error);
