import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Header } from './components/layout/Header.js';
import { Footer } from './components/layout/Footer.js';
import { HomePage } from './pages/HomePage.js';
import { SendPage } from './pages/SendPage.js';
import { ReceivePage } from './pages/ReceivePage.js';
import { HowItWorksModal } from './components/settings/HowItWorksModal.js';
import { PrivacyModal } from './components/settings/PrivacyModal.js';
import { SettingsModal } from './components/settings/SettingsModal.js';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'send' | 'receive'>('home');
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');
  const [initialJoinToken, setInitialJoinToken] = useState<string>('');

  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Check URL parameters / hash fragments for invitations: e.g. ?join=123456&token=xyz or #join=123456&token=xyz
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parseUrlInvitation = () => {
      const hash = window.location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(window.location.search);

      const code =
        searchParams.get('join') ||
        hashParams.get('join') ||
        searchParams.get('code') ||
        hashParams.get('code');
      const token =
        searchParams.get('token') ||
        hashParams.get('token') ||
        searchParams.get('invite') ||
        hashParams.get('invite');

      if (token || code) {
        if (code) setInitialJoinCode(code);
        if (token) setInitialJoinToken(token);
        setActiveTab('receive');
        // Clean URL query/hash so refreshing (F5) does not re-trigger stale invite tokens
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    parseUrlInvitation();
    window.addEventListener('hashchange', parseUrlInvitation);
    return () => window.removeEventListener('hashchange', parseUrlInvitation);
  }, []);

  const handleNavigateHome = () => {
    setInitialJoinCode('');
    setInitialJoinToken('');
    setActiveTab('home');
    if (typeof window !== 'undefined' && (window.location.search || window.location.hash)) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground transition-colors duration-200">
      {/* Navigation Header */}
      <Header
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigateHome={handleNavigateHome}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center py-4">
        {activeTab === 'home' && (
          <HomePage
            onNavigateSend={() => setActiveTab('send')}
            onNavigateReceive={() => setActiveTab('receive')}
            onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
            onOpenPrivacy={() => setIsPrivacyOpen(true)}
          />
        )}

        {activeTab === 'send' && (
          <SendPage onNavigateHome={handleNavigateHome} />
        )}

        {activeTab === 'receive' && (
          <ReceivePage
            onNavigateHome={handleNavigateHome}
            initialCode={initialJoinCode}
            initialToken={initialJoinToken}
          />
        )}
      </main>

      {/* Global Modals */}
      <HowItWorksModal
        isOpen={isHowItWorksOpen}
        onClose={() => setIsHowItWorksOpen(false)}
      />
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Footer */}
      <Footer />

      {/* Vercel Web Analytics */}
      <Analytics />
    </div>
  );
}

export default App;
