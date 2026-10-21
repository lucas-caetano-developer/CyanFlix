import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import { clearScrollRestoration } from './useScrollRestoration';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearProfile = useProfileStore((state) => state.clearProfile);
  const [isPending, setIsPending] = useState(false);

  const logout = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);

    try {
      await api.logout();
    } catch {
      // Keep the local cleanup behavior even when the server request fails.
      // The HttpOnly session cookie is controlled by the existing auth API.
    } finally {
      // Commit the public route before the profile store update. Otherwise
      // ProfileGate can race this redirect and send the user back to /profiles.
      flushSync(() => navigate('/login', { replace: true }));
      // Personal data must not survive a logout in the browser cache.
      queryClient.clear();
      clearScrollRestoration();
      clearProfile();
    }
  }, [clearProfile, isPending, navigate, queryClient]);

  return { logout, isPending };
}
