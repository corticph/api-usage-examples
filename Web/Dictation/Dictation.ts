import type {
  AuthCreds,
  DictationConfig,
  TranscriptEventData,
} from "./types";

const DEFAULT_CONFIG: DictationConfig = {
    primaryLanguage: "en",
    interimResults: true,
    spokenPunctuation: true,
    automaticPunctuation: true,
    commands: [
      {
        command: "go to next section",
        action: "next_section",
        keywords: ["next", "section"],
      },
    ],
  };

/**
 * Retrieves the user's microphone MediaStream.
 * If a device ID is provided, attempts to use that specific microphone, otherwise uses the default.
 *
 * @param deviceId - Optional ID of the desired audio input device.
 * @returns A Promise that resolves with the MediaStream.
 * @throws An error if accessing the microphone fails.
 */
const getMicrophoneStream = async (deviceId?: string): Promise<MediaStream> => {
  if (!navigator.mediaDevices) {
    throw new Error("Media Devices API not supported in this browser");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw error;
  }
};

/**
 * Starts an audio flow by connecting a MediaStream to a WebSocket endpoint and sending a config.
 * The flow begins once a CONFIG_ACCEPTED message is received, after which audio
 * data is sent in 200ms chunks via a MediaRecorder.
 *
 * @param mediaStream - The audio MediaStream to send.
 * @param authCreds - Authentication credentials containing environment, tenant, and token.
 * @param config - Optional configuration object; falls back to DEFAULT_CONFIG if not provided.
 * @returns An object with a:
 *    - `recorderStarted` boolean indicating whether the MediaRecorder has started
 *    - `stop` method to end the flow and clean up resources
 */
async function startAudioFlow(
  mediaStream: MediaStream,
  authCreds: AuthCreds,
  handleEvent: (arg0: MessageEvent) => void,
  config?: DictationConfig
): Promise<{ recorderStarted: boolean; stop: () => void }> {
  // 2. Set up configuration if not provided
  if (!config) {
    config = DEFAULT_CONFIG;
  }

  // 3. Start WebSocket connection
  const wsUrl = `wss://api.${authCreds.environment}.corti.app/audio-bridge/v2/transcribe?tenant-name=${authCreds.tenant}&token=Bearer%20${authCreds.token}`;
  const ws = new WebSocket(wsUrl);
  let isOpen = false;
  let recorderStarted = false;
  let mediaRecorder: MediaRecorder;

  ws.onopen = () => {
    ws.send(JSON.stringify({type: "config", configuration: config}));
    isOpen = true;
  };

  // 4. Wait for CONFIG_ACCEPTED message
  ws.onmessage = (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === "CONFIG_ACCEPTED" && !recorderStarted) {
        recorderStarted = true;
        startMediaRecorder();
      }
      handleEvent(msg);
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  };

  ws.onerror = (err: Event) => {
    console.error("WebSocket encountered an error:", err);
    // Optionally, call stop() to clean up resources
  };

  ws.onclose = (event: Event) => {
    console.log("WebSocket closed:", event);
    // Ensure cleanup is performed or notify the user
  };

  // 5. Start MediaRecorder with 200ms chunks and send data to WebSocket
  function startMediaRecorder() {
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (isOpen) {
        ws.send(event.data);
      }
    };
    mediaRecorder.start(200);
  }

  // 6. End the flow
  const stop = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end" }));
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    setTimeout(() => {
      ws.close();
    }, 10000);
  };

  return { recorderStarted, stop };
}

// Usage Example:
// Define authentication credentials and interaction identifier.
const authCreds: AuthCreds = {
  environment: "dev-weu",
  tenant: "copsdev",
  token: "",
};

const transcripts: TranscriptEventData[] = [];

const handleNewMessage = (msg: MessageEvent) => {
  try {
    const parsed = JSON.parse(msg.data);

    switch (parsed.type) {
      case "transcript":
        transcripts.push(parsed.data as TranscriptEventData);
        break;
      default:
        console.log("Unhandled WebSocket event type:", parsed.type);
    }
  } catch (err) {
    console.error("Failed to parse WebSocket message:", err);
  }
};

// Encapsulate the call setup in an async function.
async function startDictation() {
  try {
    // Retrieve the user's microphone stream.
    const microphoneStream = await getMicrophoneStream();

    // Start the audio flow over a WebSocket connection.
    // The returned `stop` method is used to end the audio flow gracefully.
    const { stop } = await startAudioFlow(
      microphoneStream,
      authCreds,
      handleNewMessage
    );

    // Define a cleanup function to end the call.
    const endCall = () => {
      // End the audio flow (closes WebSocket and stops MediaRecorder).
      stop();
      // Optionally, stop original streams if no longer needed.
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
      console.log("Call ended and resources cleaned up.");
    };

    return { endCall };
  } catch (error) {
    console.error("Error starting call:", error);
    throw error;
  }
}

// Example usage: start a call and end it after 10 seconds.
startDictation()
  .then(({ endCall }) => {
    setTimeout(endCall, 10000);
  })
  .catch((error) => {
    // Handle any errors that occurred during setup.
    console.error(error);
  });
