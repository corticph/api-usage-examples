/**
 * Retrieves the user's microphone MediaStream.
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
