import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { WelcomePage } from './WelcomePage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getSession: vi.fn(),
    getPublicShowcase: vi.fn(),
    login: vi.fn(),
  },
}));

function renderWelcome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WelcomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.getSession).mockResolvedValue({
    authenticated: false,
    accountId: '',
    username: '',
    role: 'viewer',
  });
  vi.mocked(api.getPublicShowcase).mockResolvedValue({
    trending: [],
  });
});

test('renders welcome page with hero, showcase banner and FAQ for unauthenticated visitors', async () => {
  renderWelcome();

  expect(screen.getByRole('heading', { name: /Filmes, séries e animes sem limites/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Acessar Minha Conta/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Em alta no CyanFlix/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Perguntas frequentes/i })).toBeInTheDocument();
});
