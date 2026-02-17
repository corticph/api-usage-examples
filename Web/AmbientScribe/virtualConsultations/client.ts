import { CortiClient, CortiEnvironment } from "@corti/sdk";
import { getMicrophoneStream, getRemoteParticipantStream } from "./audio";

// Client-side: receives a scoped token and interaction ID from the server,
// then connects to the Corti streaming API with merged doctor + patient audio.

/**
 * Merges multiple audio MediaStreams into a single multi-channel MediaStream.
 * Each input stream is mapped to a separate channel (e.g., channel 0 = doctor,
 * channel 1 = patient).
 */
function mergeMediaStreams(
  mediaStreams: MediaStream[]
): { stream: MediaStream; endStream: () => void } {
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

async function startSession(
  accessToken: string,
  interactionId: string,
  peerConnection: RTCPeerConnection
) {
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

  // 3. Get both audio streams
  const microphoneStream = await getMicrophoneStream();
  const remoteStream = getRemoteParticipantStream(peerConnection);

  // 4. Merge streams: channel 0 = doctor (local mic), channel 1 = patient (remote)
  const { stream: mergedStream, endStream } = mergeMediaStreams([
    microphoneStream,
    remoteStream,
  ]);

  // 5. Send merged audio data via MediaRecorder in 200ms chunks
  const mediaRecorder = new MediaRecorder(mergedStream);
  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      streamSocket.send(event.data);
    }
  };
  mediaRecorder.start(200);

  // 6. Handle incoming events
  streamSocket.on("transcript", (data) => {
    console.log("Transcript:", data);
  });

  streamSocket.on("fact", (data) => {
    console.log("Fact:", data);
  });

  console.log("Streaming started for interaction:", interactionId);

  // 7. Return cleanup function
  return {
    endCall: () => {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      endStream();
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
      remoteStream.getAudioTracks().forEach((track) => track.stop());
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

  // In a real app, this would come from your WebRTC setup
  const peerConnection = new RTCPeerConnection();

  const { endCall } = await startSession(
    accessToken,
    interactionId,
    peerConnection
  );

  // Wire up the end call button
  document.getElementById("end-call")?.addEventListener("click", () => {
    endCall();
    (document.getElementById("end-call") as HTMLButtonElement).disabled = true;
  });
}

main().catch(console.error);
