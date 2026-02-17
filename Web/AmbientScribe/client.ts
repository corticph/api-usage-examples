/**
 * client.ts — Browser-side AmbientScribe demo.
 *
 * Supports two modes toggled from index.html:
 *
 *   "single"  — Single microphone with automatic speaker diarization.
 *               Uses only getMicrophoneStream().
 *
 *   "virtual" — Virtual consultation (doctor + patient).
 *               Uses getMicrophoneStream() for the local doctor mic and
 *               getRemoteParticipantStream() for the patient's WebRTC audio,
 *               then merges them into a multi-channel stream so Corti can
 *               attribute speech to each participant without diarization.
 *
 * All transcript and fact events are logged to the browser console.
 */

import { CortiClient, CortiEnvironment } from "@corti/sdk";
import {
  getMicrophoneStream,
  getRemoteParticipantStream,
  mergeMediaStreams,
} from "./audio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "single" | "virtual";

/** Everything we need to tear down a running session. */
interface ActiveSession {
  endCall: () => void;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Starts a streaming session in the chosen mode.
 *
 * 1. Creates a CortiClient using the scoped access token from the server.
 * 2. Connects to the streaming WebSocket via client.stream.connect().
 * 3. Acquires the appropriate audio stream(s) depending on the mode.
 * 4. Pipes audio to Corti in 200 ms chunks via MediaRecorder.
 * 5. Listens for transcript / fact events and logs them.
 *
 * @param accessToken    Stream-scoped token received from the server.
 * @param interactionId  Interaction ID received from the server.
 * @param mode           "single" for one mic, "virtual" for doctor + patient.
 * @param peerConnection Required when mode is "virtual" — the RTCPeerConnection
 *                        carrying the remote participant's audio.
 * @returns An object with an `endCall()` method for cleanup.
 */
async function startSession(
  accessToken: string,
  interactionId: string,
  mode: Mode,
  peerConnection?: RTCPeerConnection
): Promise<ActiveSession> {
  // -- 1. Create a client scoped to streaming only -------------------------
  const client = new CortiClient({
    environment: CortiEnvironment.Eu,
    tenantName: "YOUR_TENANT_NAME",
    auth: {
      accessToken, // Token with "stream" scope only
    },
  });

  // With a stream-scoped token these would fail:
  //   await client.interactions.list();                // outside scope
  //   await client.transcribe.connect({ id: "..." });  // outside scope

  // -- 2. Connect to the Corti streaming WebSocket -------------------------
  const streamSocket = await client.stream.connect({ id: interactionId });

  // -- 3. Acquire audio depending on mode ----------------------------------
  //    "single"  → just the local microphone
  //    "virtual" → local mic + remote WebRTC audio, merged into one stream

  const microphoneStream = await getMicrophoneStream();
  console.log(`[${mode}] Microphone stream acquired`);

  // audioStream is what we feed into MediaRecorder.
  // endMergedStream is only set when we merge (virtual mode).
  let audioStream: MediaStream;
  let endMergedStream: (() => void) | undefined;

  if (mode === "virtual") {
    if (!peerConnection) {
      throw new Error("Virtual mode requires an RTCPeerConnection");
    }

    const remoteStream = getRemoteParticipantStream(peerConnection);
    console.log("[virtual] Remote participant stream acquired");

    // Merge: channel 0 = doctor (mic), channel 1 = patient (WebRTC)
    const merged = mergeMediaStreams([microphoneStream, remoteStream]);
    audioStream = merged.stream;
    endMergedStream = merged.endStream;
  } else {
    audioStream = microphoneStream;
  }

  // -- 4. Stream audio to Corti in 200 ms chunks --------------------------
  const mediaRecorder = new MediaRecorder(audioStream);

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      streamSocket.send(event.data);
    }
  };

  mediaRecorder.start(200);
  console.log(`[${mode}] MediaRecorder started — streaming audio to Corti`);

  // -- 5. Handle incoming events -------------------------------------------
  streamSocket.on("transcript", (data) => {
    console.log("Transcript:", data);
  });

  streamSocket.on("fact", (data) => {
    console.log("Fact:", data);
  });

  // -- 6. Return cleanup function ------------------------------------------
  return {
    endCall: () => {
      // Stop recording
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      // Close the stream socket
      streamSocket.close();

      // Release the merged stream (virtual mode only)
      endMergedStream?.();

      // Release the raw microphone track(s)
      microphoneStream.getAudioTracks().forEach((track) => track.stop());

      console.log(`[${mode}] Call ended — all resources cleaned up`);
    },
  };
}

// ---------------------------------------------------------------------------
// UI wiring  (called from index.html)
// ---------------------------------------------------------------------------

let activeSession: ActiveSession | null = null;

/**
 * Fetches session credentials from the server and starts streaming.
 * Reads the selected mode from the radio buttons in index.html.
 */
async function handleStart() {
  // Read selected mode from the radio group
  const modeInput = document.querySelector<HTMLInputElement>(
    'input[name="mode"]:checked'
  );
  const mode: Mode = (modeInput?.value as Mode) ?? "single";

  try {
    // Fetch interaction ID + scoped token from the server (see server.ts)
    const response = await fetch("/api/start-session", { method: "POST" });
    const { interactionId, accessToken } = await response.json();

    // In virtual mode you would pass a real RTCPeerConnection here.
    // For this demo we pass undefined — replace with your WebRTC connection.
    const peerConnection = mode === "virtual" ? new RTCPeerConnection() : undefined;

    activeSession = await startSession(
      accessToken,
      interactionId,
      mode,
      peerConnection
    );

    // Update button states
    setButtonStates(true);
    console.log(`Session started in "${mode}" mode`);
  } catch (err) {
    console.error("Failed to start session:", err);
  }
}

/** Ends the active session and releases all resources. */
function handleEnd() {
  activeSession?.endCall();
  activeSession = null;
  setButtonStates(false);
}

/** Toggle Start / End button enabled states. */
function setButtonStates(isRunning: boolean) {
  const startBtn = document.getElementById("start-call") as HTMLButtonElement;
  const endBtn = document.getElementById("end-call") as HTMLButtonElement;
  if (startBtn) startBtn.disabled = isRunning;
  if (endBtn) endBtn.disabled = !isRunning;
}

// Attach handlers once the DOM is ready.
document.getElementById("start-call")?.addEventListener("click", handleStart);
document.getElementById("end-call")?.addEventListener("click", handleEnd);
