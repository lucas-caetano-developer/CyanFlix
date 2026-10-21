import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { api } from '../../lib/api';
import { useProfileStore } from '../../stores/useProfileStore';

vi.mock('../../lib/api', () => ({
  api: {
    getActiveProfile: vi.fn(),
    getSession: vi.fn(),
    logout: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderNavbar(entry = '/browse?kind=series') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Navbar />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.getActiveProfile).mockResolvedValue({
    id: 'profile-1',
    name: 'Ana',
    role: 'viewer',
    pinProtected: false,
  });
  vi.mocked(api.getSession).mockResolvedValue({
    authenticated: true,
    accountId: 'account-1',
    username: 'conta-teste',
    role: 'viewer',
  });
  vi.mocked(api.logout).mockResolvedValue();
});

test('marks the active category and exposes the profile name', async () => {
  renderNavbar();

  const series = screen.getByRole('link', { name: 'Séries' });
  expect(series).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Filmes' })).not.toHaveAttribute('aria-current');
  expect(await screen.findByRole('button', { name: 'Conta e perfil de Ana' })).toBeInTheDocument();
});

test('opens the account menu with functional destinations and restores focus with Escape', async () => {
  const user = userEvent.setup();
  renderNavbar('/browse');

  const trigger = await screen.findByRole('button', { name: 'Conta e perfil de Ana' });
  await user.click(trigger);

  const account = screen.getByRole('group', { name: 'Conta e perfil' });
  expect(within(account).getByText('Ana')).toBeInTheDocument();
  expect(within(account).getByText('Conta: conta-teste')).toBeInTheDocument();
  expect(within(account).getByRole('link', { name: 'Conta e preferências' })).toHaveAttribute('href', '/account');
  expect(within(account).getByRole('link', { name: 'Trocar perfil' })).toHaveAttribute('href', '/profiles');
  expect(within(account).getByRole('button', { name: 'Sair da conta' })).toBeInTheDocument();
  await waitFor(() => expect(within(account).getByRole('link', { name: 'Conta e preferências' })).toHaveFocus());

  const accountLink = within(account).getByRole('link', { name: 'Conta e preferências' });
  const profilesLink = within(account).getByRole('link', { name: 'Trocar perfil' });
  const logoutButton = within(account).getByRole('button', { name: 'Sair da conta' });
  fireEvent.keyDown(accountLink, { key: 'ArrowDown' });
  expect(profilesLink).toHaveFocus();
  fireEvent.keyDown(profilesLink, { key: 'ArrowDown' });
  expect(logoutButton).toHaveFocus();
  fireEvent.keyDown(logoutButton, { key: 'ArrowDown' });
  expect(accountLink).toHaveFocus();

  fireEvent.keyDown(accountLink, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Conta e perfil' })).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('does not mark a catalog category as active outside the browse route', async () => {
  renderNavbar('/my-list?kind=movie');

  expect(screen.getByRole('link', { name: 'Minha Lista' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Filmes' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
});

test('submits the quick search and preserves the typed term in the URL', async () => {
  const user = userEvent.setup();
  renderNavbar('/browse');

  await user.click(screen.getByRole('button', { name: 'Abrir busca' }));
  const input = screen.getByRole('searchbox', { name: 'Buscar no catálogo' });
  await user.type(input, 'Ação Final{Enter}');

  await waitFor(() => {
    const target = screen.getByTestId('location').textContent ?? '';
    expect(target.startsWith('/search?q=')).toBe(true);
    expect(new URLSearchParams(target.split('?')[1]).get('q')).toBe('Ação Final');
  });
});

test('opens the mobile navigation, closes after choosing a destination and restores focus with Escape', async () => {
  const user = userEvent.setup();
  renderNavbar('/browse?kind=series');

  const toggle = screen.getByRole('button', { name: 'Abrir menu' });
  await user.click(toggle);
  const dialog = screen.getByRole('dialog', { name: 'Navegação' });
  expect(within(dialog).getByRole('link', { name: 'Séries' })).toHaveAttribute('aria-current', 'page');

  await user.click(within(dialog).getByRole('link', { name: 'Filmes' }));
  expect(screen.queryByRole('dialog', { name: 'Navegação' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse?kind=movie'));

  await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navegação' })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveFocus());
});
