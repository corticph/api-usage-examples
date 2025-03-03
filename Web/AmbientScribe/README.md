# Corti AI Platform – Live Transcription & Fact-Based Documentation  

This README provides a guide on using the **Corti AI Platform** WebSocket API for **live audio transcription** and **fact-based documentation**. It includes two approaches:  
1. **Single audio stream** – Capturing audio from a single microphone.  
2. **Dual-channel merged streams** – Combining a **local microphone** and a **WebRTC stream** for doctor-patient scenarios.  

---

## **1. Overview of Configurations**  

### **Single Stream (Diarization Mode)**  
This setup uses **one audio source** and **speaker diarization** to distinguish multiple speakers in the same channel automatically.  

```ts
const DEFAULT_CONFIG: Config = {
  type: "config",
  configuration: {
    transcription: {
      primaryLanguage: "en",
      isDiarization: true,  // AI automatically differentiates speakers
      isMultichannel: false,
      participants: [
        {
          channel: 0,
          role: "multiple",
        },
      ],
    },
    mode: { type: "facts", outputLocale: "en" },
  },
};
```

### **Dual-Channel (Explicit Roles: Doctor & Patient)**  
This setup **merges two separate audio streams** (e.g., a local microphone and a WebRTC stream). Instead of diarization, each stream is assigned a **fixed role** (Doctor or Patient).  

```ts
const DEFAULT_CONFIG: Config = {
  type: "config",
  configuration: {
    transcription: {
      primaryLanguage: "en",
      isDiarization: false,  // No automatic speaker detection
      isMultichannel: false,
      participants: [
        { channel: 0, role: "doctor" },  
        { channel: 0, role: "patient" }, 
      ],
    },
    mode: { type: "facts", outputLocale: "en" },
  },
};
```
---

## **2. Capturing Audio Streams**  

### **Single Microphone Access**
Retrieves and returns a **MediaStream** from the user's microphone.  
```ts
const microphoneStream = await getMicrophoneStream();
```

### **Merging Two Streams (Microphone + WebRTC)**
For doctor-patient conversations, we merge two separate audio sources.  
```ts
const { stream, endStream } = mergeMediaStreams([microphoneStream, webRTCStream]);
```

**How Merging Works:**  
- **Each stream is treated as a separate channel**  
- **WebRTC provides the remote participant's audio**  
- **The local microphone captures the speaker on-site**  
- **The merged stream is sent to Corti’s API**  

```ts
export const mergeMediaStreams = (mediaStreams: MediaStream[]): { stream: MediaStream; endStream: () => void } => {
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
    }
  };
};
```

---

## **3. Establishing WebSocket Connection**  
Once the audio stream is ready, we establish a WebSocket connection to Corti’s API.  

### **Starting the Audio Flow**  
```ts
const { stop } = await startAudioFlow(stream, authCreds, interactionId, handleNewMessage);
```
- **Sends real-time audio**
- **Receives transcription and facts**
- **Automatically starts when a CONFIG_ACCEPTED message is received**

---

## **4. Handling WebSocket Events (Transcripts & Facts)**  
Each incoming WebSocket message is parsed and stored.  

```ts
const transcripts: TranscriptEventData[] = [];
const facts: FactEventData[] = [];

const handleNewMessage = (msg: MessageEvent) => {
  const parsed = JSON.parse(msg.data);
  if (parsed.type === "transcript") {
    transcripts.push(parsed.data as TranscriptEventData);
  } else if (parsed.type === "fact") {
    facts.push(parsed.data as FactEventData);
  }
};
```

---

## **5. Stopping & Cleanup**  
Ensure all resources (WebSocket, MediaRecorder, and merged streams) are properly closed.  

```ts
stop(); 
microphoneStream.getAudioTracks().forEach((track) => track.stop());
webRTCStream.getAudioTracks().forEach((track) => track.stop());
endStream(); // Stops the merged audio
console.log("Call ended and resources cleaned up.");
```

---

## **6. Full Flow Example**  
### **Single-Stream (Diarization Mode)**
```ts
async function startSingleStreamCall() {
  const microphoneStream = await getMicrophoneStream();
  const { stop } = await startAudioFlow(microphoneStream, authCreds, interactionId, handleNewMessage);

  return {
    endCall: () => {
      stop();
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
    },
  };
}
```

### **Dual-Channel (Doctor-Patient Setup)**
```ts
async function startDualChannelCall() {
  const microphoneStream = await getMicrophoneStream();
  const webRTCStream = new MediaStream(); // Example WebRTC stream

  const { stream, endStream } = mergeMediaStreams([microphoneStream, webRTCStream]);
  const { stop } = await startAudioFlow(stream, authCreds, interactionId, handleNewMessage);

  return {
    endCall: () => {
      stop();
      endStream();
      microphoneStream.getAudioTracks().forEach((track) => track.stop());
      webRTCStream.getAudioTracks().forEach((track) => track.stop());
    },
  };
}
```

---

## **7. Summary**  
🚀 **Two streaming options** – single microphone **(diarization)** or **merged dual-channel streams** (doctor-patient).  
✅ **Minimal setup** – simply plug in credentials and select a mode.  
📡 **Real-time AI transcription & fact extraction** – powered by **Corti’s API**.  

For further details, refer to **Corti's API documentation**.