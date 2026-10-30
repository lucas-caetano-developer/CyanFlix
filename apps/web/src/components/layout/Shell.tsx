import React from 'react';
import { Navbar } from './Navbar';
import { ProfileGate } from './ProfileGate';
import { Footer } from './Footer';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProfileGate>
      <div className="shell" id="streaming-shell" data-spatial-scope="streaming">
        <Navbar />
        <main className="shell__content">
          {children}
        </main>
        <Footer />
      </div>
    </ProfileGate>
  );
}
