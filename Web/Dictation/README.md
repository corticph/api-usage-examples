# Corti AI Platform – Dictation Usage Examples  

This README provides a guide to integrating **Corti’s AI-powered dictation** using WebSockets. It demonstrates how to:  
1. **Capture audio from a microphone**  
2. **Stream audio to Corti’s API for real-time transcription**  
3. **Handle and process transcription events**  
4. **Manage resources efficiently**  

---

## **1. Configuration Overview**  

### **Default Dictation Configuration**  
This configuration enables **real-time transcription**, **automatic punctuation**, and **voice commands**.  

```ts
const DEFAULT_CONFIG: DictationConfig = {
  primaryLanguage: "en",
  interimResults: true, 
  spokenPunctuation: true, 
  automaticPunctuation: true,
  model: "others", 
  commands: [
    {
      command: "go to next section",
      action: "next_section",
      keywords: ["next", "section"],
    },
  ],
};
```

---

## **2. Capturing Microphone Input**  

To capture audio, request access to the user’s microphone:  

```ts
async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices) {
    throw new Error("Media Devices API not supported in this browser");
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
}
```

---

## **3. Establishing WebSocket Connection**  

Once the audio stream is ready, establish a WebSocket connection to Corti’s dictation API.  

```ts
async function startAudioFlow(
  mediaStream: MediaStream,
  authCreds: AuthCreds,
  handleEvent: (msg: MessageEvent) => void,
  config: DictationConfig = DEFAULT_CONFIG
): Promise<{ recorderStarted: boolean; stop: () => void }> {
  
  const wsUrl = `wss://api.${authCreds.environment}.corti.app/audio-bridge/v2/transcribe?tenant-name=${authCreds.tenant}&token=Bearer%20${authCreds.token}`;
  const ws = new WebSocket(wsUrl);
  let recorderStarted = false;
  let mediaRecorder: MediaRecorder;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "config", configuration: config }));
  };

  ws.onmessage = (msg: MessageEvent) => {
    const data = JSON.parse(msg.data);
    if (data.type === "CONFIG_ACCEPTED" && !recorderStarted) {
      recorderStarted = true;
      startMediaRecorder();
    }
    handleEvent(msg);
  };

  function startMediaRecorder() {
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      }
    };
    mediaRecorder.start(200);
  }

  const stop = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end" }));
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    ws.close();
  };

  return { recorderStarted, stop };
}
```

---

## **4. Handling Transcription Events**  

Incoming messages are processed to extract transcripts.  

```ts
const transcripts: TranscriptEventData[] = [];

const handleNewMessage = (msg: MessageEvent) => {
  try {
    const parsed = JSON.parse(msg.data);
    if (parsed.type === "transcript") {
      transcripts.push(parsed.data as TranscriptEventData);
    }
  } catch (err) {
    console.error("Failed to parse WebSocket message:", err);
  }
};
```

---

## **5. Full Dictation Flow**  

### **Starting a Dictation Session**  

```ts
async function startDictation() {
  try {
    const microphoneStream = await getMicrophoneStream();
    const { stop } = await startAudioFlow(microphoneStream, authCreds, handleNewMessage);

    const endDictation = () => {
      stop();
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
      console.log("Dictation ended.");
    };

    return { endDictation };
  } catch (error) {
    console.error("Error starting dictation:", error);
    throw error;
  }
}
```

### **Example Usage: Start & Stop Dictation After 10 Seconds**  

```ts
startDictation().then(({ endDictation }) => {
  setTimeout(endDictation, 10000);
});
```

---

## **6. Summary**  

🚀 **Real-time AI transcription** – Powered by **Corti AI Platform**  
🎙️ **Seamless microphone integration** – Capture and stream live audio  
📡 **WebSocket-based streaming** – Low-latency transcription with automatic punctuation  
✅ **Customizable voice commands** – Enable spoken interactions  

For further details, refer to **Corti’s API documentation**.