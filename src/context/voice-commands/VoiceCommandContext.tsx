import React, { createContext, useContext } from 'react';
import { commandEngine } from '../../services/voice-commands/CommandEngine';
import { CommandIntent } from '../../services/voice-commands/CommandTypes';

interface VoiceCommandContextType {
  executeCommand: (text: string) => CommandIntent | null;
}

const VoiceCommandContext = createContext<VoiceCommandContextType | undefined>(undefined);

export const VoiceCommandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const executeCommand = (text: string) => {
    return commandEngine.processCommand(text);
  };

  return (
    <VoiceCommandContext.Provider value={{ executeCommand }}>
      {children}
    </VoiceCommandContext.Provider>
  );
};

export const useVoiceCommands = () => {
  const context = useContext(VoiceCommandContext);
  if (!context) throw new Error('useVoiceCommands must be used within VoiceCommandProvider');
  return context;
};
