import React from 'react';
import { Navigate } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useProfileStore } from '../../stores/useProfileStore';

export function Shell({ children }: { children: React.ReactNode }) {
  const { profileId } = useProfileStore();

  if (!profileId) {
    return <Navigate to="/profiles" replace />;
  }

  return (
    <div className="shell">
      <Navbar />
      <main className="shell__content">
        {children}
      </main>
    </div>
  );
}
