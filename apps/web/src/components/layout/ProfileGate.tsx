import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useProfileStore } from '../../stores/useProfileStore';
import { Spinner } from '../ui/Spinner';

export function ProfileGate({ children }: { children: ReactNode }) {
  const profileId = useProfileStore((state) => state.profileId);
  const clearProfile = useProfileStore((state) => state.clearProfile);
  const active = useQuery({ queryKey: ['profiles', 'active'], queryFn: api.getActiveProfile, enabled: Boolean(profileId), retry: false });

  useEffect(() => {
    if (active.isError || (active.data && active.data.id !== profileId)) clearProfile();
  }, [active.data, active.isError, clearProfile, profileId]);

  if (!profileId || active.isError || (active.data && active.data.id !== profileId)) return <Navigate to="/profiles" replace />;
  if (active.isLoading) return <Spinner fullScreen />;
  return children;
}
