import React from 'react';
import { Navbar } from './Navbar';
import { ProfileGate } from './ProfileGate';
import { useTvNavigation } from '../../hooks/useTvNavigation';

export function Shell({ children }: { children: React.ReactNode }) {
  useTvNavigation('streaming-shell');
  return (
    <ProfileGate>
      <div className="shell" id="streaming-shell">
        <Navbar />
        <main className="shell__content">
          {children}
        </main>
      </div>
    </ProfileGate>
  );
}
