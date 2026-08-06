import React from 'react';

interface SafeAreaContainerProps {
  children: React.ReactNode;
}

export const SafeAreaContainer: React.FC<SafeAreaContainerProps> = ({ children }) => (
  <div className="h-full w-full pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
    {children}
  </div>
);
