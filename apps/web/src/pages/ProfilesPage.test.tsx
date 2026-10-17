import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { ProfilesPage } from './ProfilesPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: {
  getSession: vi.fn(), getProfiles: vi.fn(), unlockProfile: vi.fn(), updateProfile: vi.fn(),
} }));

beforeEach(() => {
  vi.mocked(api.getSession).mockResolvedValue({ authenticated: true, accountId: 'account-1', username: 'viewer', role: 'viewer' });
  vi.mocked(api.getProfiles).mockResolvedValue([{ id: 'profile-1', name: 'Protegido', role: 'viewer', pinProtected: true, maxAgeRating: 12 }]);
  vi.mocked(api.unlockProfile).mockResolvedValue({ id: 'profile-1', name: 'Protegido', role: 'viewer', pinProtected: true, maxAgeRating: 12 });
});

test('requires the PIN before entering a protected profile', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/profiles" element={<ProfilesPage />} />
    <Route path="/browse" element={<div>Catálogo liberado</div>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  await user.click(await screen.findByRole('button', { name: /protegido/i }));
  expect(screen.getByRole('dialog', { name: /pin de protegido/i })).toBeInTheDocument();
  await user.type(screen.getByLabelText('PIN'), '1234');
  await user.click(screen.getByRole('button', { name: 'Desbloquear' }));
  expect(api.unlockProfile).toHaveBeenCalledWith('profile-1', '1234');
  expect(await screen.findByText('Catálogo liberado')).toBeInTheDocument();
});
