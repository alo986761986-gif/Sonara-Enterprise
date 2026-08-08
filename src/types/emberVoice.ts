export interface EmberVoiceConfig {
  enabled: boolean;
  providerConfigured: boolean;
  capabilities: {
    speech: boolean;
    realtime: boolean;
  };
}