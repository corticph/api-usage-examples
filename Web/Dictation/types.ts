export interface AuthCreds {
    environment: string;
    tenant: string;
    token: string;
  }
  
export interface DictationConfig {
    primaryLanguage: string;
    interimResults: boolean;
    spokenPunctuation: boolean;
    automaticPunctuation: boolean;
    model: string;
    commands?: Command[];
}


export interface Command {
    command: string;
    action: string;
    keywords: string[];
}

export interface TranscriptEventData {
    text: string;
    rawTranscriptText: string;
    isFinal: boolean;
}