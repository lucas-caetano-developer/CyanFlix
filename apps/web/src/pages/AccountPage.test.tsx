import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AccountPage } from './AccountPage';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';

vi.mock('../lib/api', () => ({
  api: {
    getSession: vi.fn(),
    getActiveProfile: vi.fn(),
    getProfilePreferences: vi.fn(),
    updateProfilePreferences: vi.fn(),
    logout: vi.fn(),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/account']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<div>Entrar</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.getSession).mockResolvedValue({
    authenticated: true,
    accountId: 'account-1',
    username: 'conta-teste',
    role: 'viewer',
  });
  vi.mocked(api.getActiveProfile).mockResolvedValue({
    id: 'profile-1',
    name: 'Ana',
    role: 'viewer',
    pinProtected: false,
    maxAgeRating: 14,
  });
  vi.mocked(api.getProfilePreferences).mockResolvedValue({
    autoplayNextEpisode: true,
    subtitleStyle: 'medium',
  });
  vi.mocked(api.updateProfilePreferences).mockResolvedValue({
    autoplayNextEpisode: false,
    subtitleStyle: 'medium',
  });
  vi.mocked(api.logout).mockResolvedValue();
});

test('shows the real account identity and saves only the supported profile preferences', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Conta e preferências' })).toBeInTheDocument();
  expect(await screen.findByText('Ana')).toBeInTheDocument();
  expect(screen.getByText('Conta: conta-teste')).toBeInTheDocument();
  expect(screen.getByText('Até 14 anos')).toBeInTheDocument();

  const autoplay = screen.getByRole('combobox', { name: /próximo episódio automaticamente/i });
  const subtitles = screen.getByRole('combobox', { name: /tamanho das legendas/i });
  expect(autoplay).toHaveValue('on');
  expect(subtitles).toHaveValue('medium');
  expect(screen.queryByRole('combobox', { name: /idioma|qualidade|velocidade/i })).not.toBeInTheDocument();

  const save = screen.getByRole('button', { name: 'Salvar preferências' });
  expect(save).toBeDisabled();

  await user.selectOptions(autoplay, 'off');
  expect(save).toBeEnabled();
  await user.click(save);

  await waitFor(() => expect(api.updateProfilePreferences).toHaveBeenCalledWith('profile-1', {
    autoplayNextEpisode: false,
    subtitleStyle: 'medium',
  }));
  expect(await screen.findByText('Preferências salvas.')).toBeInTheDocument();
});

test('keeps the draft and reports a persistence failure', async () => {
  const user = userEvent.setup();
  vi.mocked(api.updateProfilePreferences).mockRejectedValue(new Error('offline'));
  renderPage();

  const autoplay = await screen.findByRole('combobox', { name: /próximo episódio automaticamente/i });
  await user.selectOptions(autoplay, 'off');
  await user.click(screen.getByRole('button', { name: 'Salvar preferências' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar as preferências');
  expect(autoplay).toHaveValue('off');
});
