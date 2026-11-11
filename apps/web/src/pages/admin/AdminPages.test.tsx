import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminCatalogPage } from './AdminCatalogPage';
import { AdminHomeSectionsPage } from './AdminHomeSectionsPage';
import { AdminPackagesPage } from './AdminPackagesPage';
import { AdminClientsPage } from './AdminClientsPage';
import { AdminVoiceActorsPage } from './AdminVoiceActorsPage';
import { AdminVoiceActorDetailPage } from './AdminVoiceActorDetailPage';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getSession: vi.fn(),
    getAdminDashboard: vi.fn(),
    getAdminStorage: vi.fn(),
    getAdminCatalog: vi.fn(),
    getAdminWork: vi.fn(),
    getWorkDeletionPreview: vi.fn(),
    updateEditorialWork: vi.fn(),
    getHomeSections: vi.fn(),
    updateHomeSections: vi.fn(),
    getAdminPublications: vi.fn(),
    getAdminPublication: vi.fn(),
    getAdminRevisions: vi.fn(),
    retryPublication: vi.fn(),
    deleteAdminPublication: vi.fn(),
    activateRevision: vi.fn(),
    getAdminAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    getAdminVoiceActors: vi.fn(),
    getAdminVoiceActor: vi.fn(),
    createAdminVoiceActor: vi.fn(),
    updateAdminVoiceActor: vi.fn(),
    deleteAdminVoiceActor: vi.fn(),
    uploadVoiceActorPhoto: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const testClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={testClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
}

function renderWithRoute(ui: React.ReactElement, initialEntry = '/admin/voice-actors/actor-1', path = '/admin/voice-actors/:id') {
  const testClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={testClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Admin Overhaul Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AdminOverviewPage with storage and metrics', async () => {
    vi.mocked(api.getAdminDashboard).mockResolvedValue({
      works: 12,
      seasons: 20,
      episodes: 150,
      publications: 25,
      publicationProcessing: 0,
      publicationRetrying: 0,
      publicationFailed: 1,
    });
    vi.mocked(api.getAdminStorage).mockResolvedValue({
      assets: { count: 30, bytes: 10485760 },
      media: { count: 150, bytes: 52428800 },
      publications: { count: 25, bytes: 20971520 },
      transcodeCache: { count: 10, bytes: 5242880 },
      disk: { totalBytes: 10737418240, freeBytes: 8589934592 },
    });

    renderWithClient(<AdminOverviewPage />);

    expect(await screen.findByText('Armazenamento em Disco')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Obras Cadastradas')).toBeInTheDocument();
    expect(screen.getByText('Mídias HLS')).toBeInTheDocument();
  });

  it('renders AdminCatalogPage and allows filtering', async () => {
    vi.mocked(api.getAdminCatalog).mockResolvedValue({
      items: [
        {
          id: 'work-1',
          canonicalTitle: 'Attack on Titan',
          title: 'Attack on Titan',
          contentKind: 'anime',
          year: 2013,
          hidden: false,
          featured: true,
          seasonCount: 4,
          episodeCount: 75,
        },
      ],
      nextCursor: null,
    });

    renderWithClient(<AdminCatalogPage />);

    expect(await screen.findByText('Attack on Titan')).toBeInTheDocument();
    expect(screen.getByText('🟢 Visível')).toBeInTheDocument();
    expect(screen.getByText('Editar Obra')).toBeInTheDocument();
  });

  it('renders AdminHomeSectionsPage with pre-configured sections and save button', async () => {
    vi.mocked(api.getHomeSections).mockResolvedValue([
      { id: 'featured', title: 'Destaques', defaultTitle: 'Destaques', enabled: true, type: 'system', sortOrder: 0 },
      { id: 'anime', title: 'Animes Favoritos', defaultTitle: 'Animes', enabled: true, type: 'system', sortOrder: 1 },
      { id: 'genre:action', title: 'Ação', defaultTitle: 'Ação', enabled: false, type: 'genre', sortOrder: 2 },
    ]);

    renderWithClient(<AdminHomeSectionsPage />);

    expect(await screen.findByText('Seções da Home')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Destaques')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Animes Favoritos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ação')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Salvar Alterações' })[0]).toBeInTheDocument();
  });

  it('renders AdminPackagesPage with packages and revisions tabs', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ authenticated: true, accountId: 'acc-1', username: 'owner', role: 'owner' });
    vi.mocked(api.getAdminPublications).mockResolvedValue({
      items: [
        {
          id: 'pub-1',
          uploadId: 'up-1',
          packageId: 'pkg_aot_s1',
          packageType: 'season',
          state: 'failed',
          createdAt: new Date().toISOString(),
          manifestSha256: 'abc123',
          totalSizeBytes: 1048576,
        },
      ],
      nextCursor: null,
    });
    vi.mocked(api.getAdminRevisions).mockResolvedValue([
      {
        id: 'rev-1',
        publicationId: 'pub-1',
        scopeKey: 'aot-s1',
        number: 1,
        active: true,
        createdAt: new Date().toISOString(),
        packageId: 'pkg_aot_s1',
        packageType: 'season',
        publicationState: 'confirmed',
        workTitle: 'Attack on Titan',
        seasonTitle: 'Temporada 1',
      },
    ]);

    renderWithClient(<AdminPackagesPage />);

    expect(await screen.findByText('pkg_aot_s1')).toBeInTheDocument();
    expect(screen.getByText('▶ Continuar Falha')).toBeInTheDocument();

    // Switch to revisions tab
    fireEvent.click(screen.getByText('🔄 Revisões do Catálogo'));
    expect(await screen.findByText('Attack on Titan')).toBeInTheDocument();
    expect(screen.getByText('Temporada Inteira')).toBeInTheDocument();
    expect(screen.getByText('🟢 Ativo')).toBeInTheDocument();
    expect(screen.getByText('Apagar Pacote')).toBeInTheDocument();
  });

  it('renders AdminClientsPage with accounts table and actions', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ authenticated: true, accountId: 'owner-id', username: 'admin_master', role: 'owner' });
    vi.mocked(api.getAdminAccounts).mockResolvedValue([
      {
        id: 'client-1',
        username: 'cliente_joao',
        role: 'viewer',
        disabled: false,
        createdAt: new Date().toISOString(),
        _count: { profiles: 2 },
      },
    ]);

    renderWithClient(<AdminClientsPage />);

    expect(await screen.findByText('cliente_joao')).toBeInTheDocument();
    expect(screen.getByText('2 perfil(is)')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Inativar Conta')).toBeInTheDocument();
    expect(screen.getByText('Excluir Conta')).toBeInTheDocument();
  });

  it('renders AdminVoiceActorsPage and allows opening create modal', async () => {
    vi.mocked(api.getAdminVoiceActors).mockResolvedValue([
      {
        id: 'actor-1',
        name: 'Wendel Bezerra',
        photoUrl: '/media/custom/wendel.webp',
        bio: 'Dublador de Goku, Bob Esponja...',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    renderWithClient(<AdminVoiceActorsPage />);

    expect(await screen.findByText('Wendel Bezerra')).toBeInTheDocument();
    expect(screen.getByText('Dublador de Goku, Bob Esponja...')).toBeInTheDocument();
    expect(screen.getByText('+ Adicionar Dublador')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ Adicionar Dublador'));
    expect(screen.getByText('Novo Dublador')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome Completo/i)).toBeInTheDocument();
  });

  it('renders AdminVoiceActorDetailPage with details and future characters section', async () => {
    vi.mocked(api.getAdminVoiceActor).mockResolvedValue({
      id: 'actor-1',
      name: 'Guilherme Briggs',
      photoUrl: '/media/custom/briggs.webp',
      bio: 'Dublador de Buzz Lightyear, Superman...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithRoute(<AdminVoiceActorDetailPage />);

    expect(await screen.findByText('Guilherme Briggs')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Guilherme Briggs')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Dublador de Buzz Lightyear, Superman...')).toBeInTheDocument();
    expect(screen.getByText('Personagens Dublados')).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(screen.getByText(/Módulo de Personagens em Desenvolvimento/i)).toBeInTheDocument();
  });
});
