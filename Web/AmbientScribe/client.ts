/**
 * client.ts — Browser-side AmbientScribe demo.
 *
 * Supports two modes toggled from index.html:
 *
 *   "single"  — Single microphone with automatic speaker diarization.
 *               Uses only getMicrophoneStream().
 *
 *   "virtual" — Virtual consultation (doctor + patient).
 *               Uses getMicrophoneStream() for the local doctor mic and a
 *               remote audio source for the patient, then merges them into a
 *               multi-channel stream so Corti can attribute speech to each
 *               participant without diarization.
 *
 *               The remote source can come from either:
 *                 - "webrtc"  — an RTCPeerConnection (getRemoteParticipantStream)
 *                 - "display" — screen/tab capture (getDisplayMediaStream),
 *                               useful when the video-call app is running in
 *                               another tab and you don't have direct access
 *                               to the peer connection.
 *
 * All transcript and fact events are logged to the browser console.
 */

import { CortiClient, CortiEnvironment } from "@corti/sdk";
import {
  getMicrophoneStream,
  getRemoteParticipantStream,
  getDisplayMediaStream,
  mergeMediaStreams,
} from "./audio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "single" | "virtual";

/** How the remote participant's audio is captured in virtual mode. */
type RemoteSource = "webrtc" | "display";

/** Everything we need to tear down a running session. */
interface ActiveSession {
  endConsultation: () => void;
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
 * @param remoteSource   How to capture the remote participant's audio in
 *                        virtual mode: "webrtc" or "display". Ignored in
 *                        single mode.
 * @param peerConnection Required when remoteSource is "webrtc" — the
 *                        RTCPeerConnection carrying the remote audio.
 * @returns An object with an `endConsultation()` method for cleanup.
 */
async function startSession(
  accessToken: string,
  interactionId: string,
  mode: Mode,
  remoteSource: RemoteSource = "webrtc",
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
  //    "virtual" → local mic + remote audio (WebRTC or display), merged

  const microphoneStream = await getMicrophoneStream();
  console.log(`[${mode}] Microphone stream acquired`);

  // audioStream is what we feed into MediaRecorder.
  // endMergedStream is only set when we merge (virtual mode).
  let audioStream: MediaStream;
  let remoteStream: MediaStream | undefined;
  let endMergedStream: (() => void) | undefined;

  if (mode === "virtual") {
    // Get the remote participant's audio from the chosen source.
    if (remoteSource === "display") {
      // Screen / tab capture — the browser will show a picker dialog.
      // Useful when the video-call runs in another tab and you don't
      // have direct access to the peer connection.
      remoteStream = await getDisplayMediaStream();
      console.log("[virtual:display] Display media stream acquired");
    } else {
      // WebRTC — pull audio tracks from an existing peer connection.
      if (!peerConnection) {
        throw new Error(
          'Virtual mode with remoteSource "webrtc" requires an RTCPeerConnection'
        );
      }
      remoteStream = getRemoteParticipantStream(peerConnection);
      console.log("[virtual:webrtc] Remote participant stream acquired");
    }

    // Merge: channel 0 = doctor (mic), channel 1 = patient (remote)
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
    endConsultation: () => {
      // Stop recording
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      // Close the stream socket
      streamSocket.close();

      // Release the merged stream (virtual mode only)
      endMergedStream?.();

      // Release the remote stream tracks (virtual mode only)
      remoteStream?.getAudioTracks().forEach((track) => track.stop());

      // Release the raw microphone track(s)
      microphoneStream.getAudioTracks().forEach((track) => track.stop());

      console.log(`[${mode}] Consultation ended — all resources cleaned up`);
    },
  };
}

// ---------------------------------------------------------------------------
// UI wiring  (called from index.html)
// ---------------------------------------------------------------------------

let activeSession: ActiveSession | null = null;
let currentInteractionId: string | null = null;

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

  // Read remote source preference (only relevant in virtual mode)
  const remoteSourceInput = document.querySelector<HTMLInputElement>(
    'input[name="remote-source"]:checked'
  );
  const remoteSource: RemoteSource =
    (remoteSourceInput?.value as RemoteSource) ?? "webrtc";

  try {
    // Fetch interaction ID + scoped token from the server (see server.ts)
    const response = await fetch("/api/start-session", { method: "POST" });
    const { interactionId, accessToken } = await response.json();

    // In virtual/webrtc mode you would pass a real RTCPeerConnection here.
    // For this demo we pass undefined — replace with your WebRTC connection.
    const peerConnection =
      mode === "virtual" && remoteSource === "webrtc"
        ? new RTCPeerConnection()
        : undefined;

    currentInteractionId = interactionId;

    activeSession = await startSession(
      accessToken,
      interactionId,
      mode,
      remoteSource,
      peerConnection
    );

    // Update button states
    setButtonStates("running");
    console.log(`Session started in "${mode}" mode`);
  } catch (err) {
    console.error("Failed to start session:", err);
  }
}

/** Ends the active session and releases all resources. */
function handleEnd() {
  activeSession?.endConsultation();
  activeSession = null;
  setButtonStates("stopped");
}

/**
 * Calls the server to fetch facts and generate a clinical document
 * from the consultation that just ended.
 */
async function handleCreateDocument() {
  if (!currentInteractionId) {
    console.error("No interaction ID available — start a consultation first");
    return;
  }

  const createBtn = document.getElementById("create-document") as HTMLButtonElement;
  const statusMessage = document.getElementById("status-message") as HTMLElement;
  const documentOutput = document.getElementById("document-output") as HTMLPreElement;

  createBtn.disabled = true;
  statusMessage.innerHTML = "<em>Creating document…</em>";
  documentOutput.style.display = "none";

  try {
    const response = await fetch("/api/create-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interactionId: currentInteractionId }),
    });

    const { document, error } = await response.json();

    if (error) {
      throw new Error(error);
    }

    console.log("Document created:", document);
    statusMessage.innerHTML = "<em>Document created successfully.</em>";
    documentOutput.textContent = JSON.stringify(document, null, 2);
    documentOutput.style.display = "";
  } catch (err) {
    console.error("Failed to create document:", err);
    statusMessage.innerHTML = "<em>Failed to create document — see console.</em>";
    createBtn.disabled = false;
  }
}

/** Update button states based on the consultation lifecycle. */
function setButtonStates(state: "idle" | "running" | "stopped") {
  const startBtn = document.getElementById("start-consultation") as HTMLButtonElement;
  const endBtn = document.getElementById("end-consultation") as HTMLButtonElement;
  const createBtn = document.getElementById("create-document") as HTMLButtonElement;

  if (startBtn) startBtn.disabled = state === "running";
  if (endBtn) endBtn.disabled = state !== "running";
  if (createBtn) createBtn.disabled = state !== "stopped";
}

// Attach handlers once the DOM is ready.
document.getElementById("start-consultation")?.addEventListener("click", handleStart);
document.getElementById("end-consultation")?.addEventListener("click", handleEnd);
document.getElementById("create-document")?.addEventListener("click", handleCreateDocument);
