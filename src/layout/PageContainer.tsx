import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
}

export const PageContainer: React.FC<PageContainerProps> = ({ children }) => (
  <div className="w-full max-w-7xl mx-auto px-1 sm:px-4 py-2 sm:py-6">
    {children}
  </div>
);
