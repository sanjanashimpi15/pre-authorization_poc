import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PreAuthShell } from './components/PreAuthShell';
import { AuthModal } from './components/AuthModal';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-opd-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-opd-primary/20 border-t-opd-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthModal isOpen={true} onClose={() => {}} />;
  }

  return (
    <div className="flex h-screen bg-opd-bg text-opd-text-primary overflow-hidden">
      <main className="flex-1 relative overflow-auto">
        <PreAuthShell />
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
