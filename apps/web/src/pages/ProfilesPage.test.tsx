import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { ProfilesPage } from './ProfilesPage';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';

vi.mock('../lib/api', () => ({ api: {
  getSession: vi.fn(), getProfiles: vi.fn(), getActiveProfile: vi.fn(), unlockProfile: vi.fn(), updateProfile: vi.fn(), logout: vi.fn(),
} }));

beforeEach(() => {
  vi.clearAllMocks();
  useProfileStore.setState({ profileId: undefined });
  vi.mocked(api.getSession).mockResolvedValue({ authenticated: true, accountId: 'account-1', username: 'viewer', role: 'viewer' });
  vi.mocked(api.getProfiles).mockResolvedValue([{ id: 'profile-1', name: 'Protegido', role: 'viewer', pinProtected: true, maxAgeRating: 12 }]);
  vi.mocked(api.getActiveProfile).mockResolvedValue({ id: 'profile-1', name: 'Protegido', role: 'viewer', pinProtected: true, maxAgeRating: 12 });
  vi.mocked(api.unlockProfile).mockResolvedValue({ id: 'profile-1', name: 'Protegido', role: 'viewer', pinProtected: true, maxAgeRating: 12 });
  vi.mocked(api.logout).mockResolvedValue();
});

test('requires the PIN before entering a protected profile', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/profiles" element={<ProfilesPage />} />
    <Route path="/browse" element={<div>Catálogo liberado</div>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  await user.click(await screen.findByRole('button', { name: /entrar no perfil protegido/i }));
  expect(screen.getByRole('dialog', { name: /desbloquear protegido/i })).toBeInTheDocument();
  await user.type(screen.getByLabelText('PIN'), '1234');
  await user.click(screen.getByRole('button', { name: 'Desbloquear' }));
  expect(api.unlockProfile).toHaveBeenCalledWith('profile-1', '1234');
  expect(await screen.findByText('Catálogo liberado')).toBeInTheDocument();
});

test('highlights the active profile and continues without asking for the PIN again', async () => {
  const user = userEvent.setup();
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.getActiveProfile).mockResolvedValue({ id: 'profile-1', name: 'Protegido', role: 'viewer', pinProtected: true, maxAgeRating: 12 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/profiles" element={<ProfilesPage />} />
    <Route path="/browse" element={<div>Catálogo liberado</div>} />
  </Routes></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/ativo/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /continuar com perfil protegido/i }));

  expect(api.unlockProfile).not.toHaveBeenCalled();
  expect(await screen.findByText('Catálogo liberado')).toBeInTheDocument();
});

test('closes profile settings with Escape and returns focus to the trigger', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/profiles" element={<ProfilesPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);

  const trigger = await screen.findByRole('button', { name: 'Ajustar perfil Protegido' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: /Ajustar perfil de Protegido/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Nome do perfil')).toHaveFocus());

  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Ajustar perfil de Protegido/i })).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('allows renaming the profile through the existing profile update contract', async () => {
  const user = userEvent.setup();
  vi.mocked(api.updateProfile).mockResolvedValue({ id: 'profile-1', name: 'Cinefilo', role: 'viewer', pinProtected: true, maxAgeRating: 12 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profiles']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/profiles" element={<ProfilesPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);

  await user.click(await screen.findByRole('button', { name: 'Ajustar perfil Protegido' }));
  const nameInput = screen.getByLabelText('Nome do perfil');
  await user.clear(nameInput);
  await user.type(nameInput, 'Cinefilo');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));

  expect(api.updateProfile).toHaveBeenCalledWith('profile-1', expect.objectContaining({ name: 'Cinefilo' }));
});
