export interface AuthCreds {
  environment: string;
  tenant: string;
  token: string;
}

export interface Config {
  type: string;
  configuration: {
    transcription: {
      primaryLanguage: string;
      isDiarization: boolean;
      isMultichannel: boolean;
      participants: Array<{
        channel: number;
        role: string;
      }>;
    };
    mode: {
      type: string;
      outputLocale: string;
    };
  };
}

export interface TranscriptEventData {
  id: string;
  start: number;
  duration: number;
  transcript: string;
  isFinal: boolean;
  participant: {
    channel: number;
    role: string;
  };
  time: {
    start: number;
    end: number;
  };
}

export interface FactEventData {
  id: string;
  text: string;
  createdAt: string;
  createdAtTzOffset: string;
  evidence?: Array<object>;
  group: string;
  groupId: string;
  isDiscarded: boolean;
  source: "core" | "system" | "user";
  updatedAt: string;
  updatedAtTzOffset: string;
}

export interface TranscriptMessage {
  type: "transcript";
  data: TranscriptEventData;
}

export interface FactMessage {
  type: "fact";
  data: FactEventData;
}

export type WSSEvent = TranscriptMessage | FactMessage;
