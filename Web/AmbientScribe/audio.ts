/**
 * audio.ts — Audio stream utilities for AmbientScribe.
 *
 * Exposes two methods for obtaining audio streams:
 *   1. getMicrophoneStream()          — local microphone (works in both modes)
 *   2. getRemoteParticipantStream()   — remote party via WebRTC (virtual consultations)
 *
 * Also provides mergeMediaStreams() for combining multiple streams into a
 * single multi-channel stream before sending to Corti.
 */

// ---------------------------------------------------------------------------
// 1. Local microphone
// ---------------------------------------------------------------------------

/**
 * Opens the user's microphone and returns the resulting MediaStream.
 *
 * @param deviceId  Optional device ID if a specific microphone is desired.
 *                  When omitted the browser's default audio input is used.
 * @returns A MediaStream containing a single audio track from the microphone.
 */
export async function getMicrophoneStream(
  deviceId?: string
): Promise<MediaStream> {
  if (!navigator.mediaDevices) {
    throw new Error("Media Devices API not supported in this browser");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
}

// ---------------------------------------------------------------------------
// 2. Remote participant (WebRTC)
// ---------------------------------------------------------------------------

/**
 * Extracts the remote participant's audio from an active WebRTC peer connection.
 *
 * In a virtual consultation the remote party's audio arrives via WebRTC.
 * This helper collects all incoming audio tracks from the connection's
 * receivers into a single MediaStream.
 *
 * @param peerConnection  An RTCPeerConnection that already has remote audio tracks.
 * @returns A MediaStream containing the remote participant's audio track(s).
 * @throws If the peer connection has no remote audio tracks.
 */
export function getRemoteParticipantStream(
  peerConnection: RTCPeerConnection
): MediaStream {
  const remoteStream = new MediaStream();

  for (const receiver of peerConnection.getReceivers()) {
    if (receiver.track.kind === "audio") {
      remoteStream.addTrack(receiver.track);
    }
  }

  if (!remoteStream.getAudioTracks().length) {
    throw new Error("No remote audio tracks found on the peer connection");
  }

  return remoteStream;
}

// ---------------------------------------------------------------------------
// 3. Stream merging (used in virtual consultation mode)
// ---------------------------------------------------------------------------

/**
 * Merges multiple MediaStreams into a single multi-channel MediaStream.
 *
 * Each input stream is mapped to its own channel (by array index), so
 * channel 0 = first stream, channel 1 = second stream, etc.
 * This lets Corti attribute speech to the correct participant without
 * relying on diarization.
 *
 * @param mediaStreams  Array of MediaStreams to merge. Each must have at
 *                      least one audio track.
 * @returns An object with:
 *   - `stream`    — the merged MediaStream to feed into MediaRecorder
 *   - `endStream` — cleanup function that stops tracks and closes the AudioContext
 */
export function mergeMediaStreams(
  mediaStreams: MediaStream[]
): { stream: MediaStream; endStream: () => void } {
  if (!mediaStreams.length) {
    throw new Error("No media streams provided");
  }

  // Validate every stream has audio before we start wiring things up.
  mediaStreams.forEach((stream, index) => {
    if (!stream.getAudioTracks().length) {
      throw new Error(
        `MediaStream at index ${index} does not have an audio track`
      );
    }
  });

  // Create an AudioContext and a ChannelMerger with one input per stream.
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const channelMerger = audioContext.createChannelMerger(mediaStreams.length);

  // Wire each stream's first audio output into its dedicated merger channel.
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
