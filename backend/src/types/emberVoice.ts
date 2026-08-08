export interface EmberVoiceConfig {
  enabled: boolean;
  providerConfigured: boolean;
  capabilities: {
    speech: true;
    realtime: false;
  };
}

export interface EmberVoiceSpeechRequest {
  text: string;
}