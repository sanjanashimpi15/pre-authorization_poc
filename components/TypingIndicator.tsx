import React from 'react';

export const TypingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1.5 p-2">
    <div className="w-2 h-2 bg-aivana-accent rounded-full animate-dotPulse" style={{ animationDelay: '0s' }}></div>
    <div className="w-2 h-2 bg-aivana-accent rounded-full animate-dotPulse" style={{ animationDelay: '0.2s' }}></div>
    <div className="w-2 h-2 bg-aivana-accent rounded-full animate-dotPulse" style={{ animationDelay: '0.4s' }}></div>
  </div>
);