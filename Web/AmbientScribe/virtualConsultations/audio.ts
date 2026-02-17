/**
 * Retrieves the user's local microphone MediaStream.
 * If a device ID is provided, attempts to use that specific microphone,
 * otherwise uses the default audio input device.
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

/**
 * Extracts the remote participant's audio MediaStream from a WebRTC peer connection.
 * Use this to capture the other party's audio in a virtual consultation.
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
