/**
 * client.ts — Corti SDK streaming integration for AmbientScribe.
 *
 * Provides a single entry point — startSession() — that:
 *   1. Creates a CortiClient with a stream-scoped access token.
 *   2. Connects to the Corti streaming WebSocket.
 *   3. Acquires audio depending on the selected mode.
 *   4. Streams audio to Corti in 200 ms chunks.
 *   5. Emits transcript and fact events via callbacks.
 *
 * This module has no DOM dependencies — all UI wiring lives in index.html.
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

export type Mode = "single" | "virtual";

/** How the remote participant's audio is captured in virtual mode. */
export type RemoteSource = "webrtc" | "display";

export interface SessionOptions {
  accessToken: string;
  interactionId: string;
  tenantName: string;
  mode: Mode;
  remoteSource?: RemoteSource;
  peerConnection?: RTCPeerConnection;
  onTranscript?: (data: unknown) => void;
  onFact?: (data: unknown) => void;
}

export interface ActiveSession {
  endConsultation: () => void;
}

// ---------------------------------------------------------------------------
// startSession
// ---------------------------------------------------------------------------

/**
 * Starts a streaming session in the chosen mode.
 *
 * 1. Creates a CortiClient using the scoped access token from the server.
 * 2. Connects to the streaming WebSocket via client.stream.connect().
 * 3. Acquires the appropriate audio stream(s) depending on the mode.
 * 4. Pipes audio to Corti in 200 ms chunks via MediaRecorder.
 * 5. Fires onTranscript / onFact callbacks for incoming events.
 *
 * @returns An object with an `endConsultation()` method for cleanup.
 */
export async function startSession(
  options: SessionOptions
): Promise<ActiveSession> {
  const {
    accessToken,
    interactionId,
    tenantName,
    mode,
    remoteSource = "webrtc",
    peerConnection,
    onTranscript,
    onFact,
  } = options;

  // -- 1. Create a client scoped to streaming only -------------------------
  const client = new CortiClient({
    environment: CortiEnvironment.Eu,
    tenantName,
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
    onTranscript?.(data);
  });

  streamSocket.on("fact", (data) => {
    console.log("Fact:", data);
    onFact?.(data);
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
