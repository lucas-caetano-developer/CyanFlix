import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import { useLogout } from '../hooks/useLogout';
import { CatalogHeader } from '../components/catalog/CatalogHeader';
import { CatalogMessage } from '../components/catalog/CatalogMessage';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import type { ProfilePreferences } from '../lib/types';

export function AccountPage() {
  const profileId = useProfileStore((state) => state.profileId);
  const queryClient = useQueryClient();
  const { logout, isPending: loggingOut } = useLogout();
  const preferencesNoteId = useId();
  const [draft, setDraft] = useState<ProfilePreferences | null>(null);
  const [feedback, setFeedback] = useState('');

  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: api.getSession,
    retry: false,
  });
  const activeProfile = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: api.getActiveProfile,
    enabled: Boolean(profileId),
    retry: false,
  });
  const preferences = useQuery({
    queryKey: ['profile-preferences', profileId],
    queryFn: () => api.getProfilePreferences(profileId!),
    enabled: Boolean(profileId),
    retry: 1,
  });

  useEffect(() => {
    if (preferences.data) setDraft(preferences.data);
  }, [preferences.data]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const savePreferences = useMutation({
    mutationFn: (values: ProfilePreferences) => {
      if (!profileId) throw new Error('Perfil indisponível');
      return api.updateProfilePreferences(profileId, values);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile-preferences', profileId], updated);
      setDraft(updated);
      setFeedback('Preferências salvas.');
    },
  });

  const profile = activeProfile.data;
  const profileName = profile?.name?.trim();
  const accountName = session.data?.username?.trim();
  const maxAgeLabel = profile?.maxAgeRating == null
    ? 'Sem limite'
    : profile.maxAgeRating === 0
      ? 'Livre'
      : `Até ${profile.maxAgeRating} anos`;
  const isDirty = Boolean(
    draft
    && preferences.data
    && (draft.autoplayNextEpisode !== preferences.data.autoplayNextEpisode
      || draft.subtitleStyle !== preferences.data.subtitleStyle),
  );

  const updateDraft = (patch: Partial<ProfilePreferences>) => {
    setFeedback('');
    savePreferences.reset();
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  return (
    <div className="catalog-page account-page">
      <CatalogHeader
        eyebrow="Área pessoal"
        title="Conta e preferências"
        description="A identidade do perfil ativo, os ajustes de reprodução já suportados e atalhos para sua experiência pessoal."
        meta={profileName ? `Perfil ativo: ${profileName}` : 'Perfil ativo'}
        actions={<Link to="/profiles" className="btn btn--secondary">Trocar perfil</Link>}
      />

      <div className="account-layout">
        <section className="account-panel" aria-labelledby="account-identity-title">
          <div className="account-panel__heading">
            <h2 id="account-identity-title" className="account-panel__title">Identidade</h2>
            <span className="account-panel__badge">Perfil ativo</span>
          </div>

          <div className="account-identity">
            <ProfileAvatar
              name={profileName}
              avatar={profile?.avatar}
              className="profile-avatar--lg"
            />
            <div className="account-identity__copy">
              <strong>{profileName ?? (activeProfile.isLoading ? 'Carregando perfil…' : 'Perfil ativo')}</strong>
              <span>{accountName ? `Conta: ${accountName}` : session.isLoading ? 'Carregando conta…' : 'Dados da conta indisponíveis'}</span>
            </div>
          </div>

          <dl className="account-details">
            <div className="account-details__row">
              <dt>Proteção do perfil</dt>
              <dd>{profile ? (profile.pinProtected ? 'PIN ativo' : 'Sem PIN') : activeProfile.isLoading ? 'Carregando…' : 'Indisponível'}</dd>
            </div>
            <div className="account-details__row">
              <dt>Classificação máxima</dt>
              <dd>{profile ? maxAgeLabel : activeProfile.isLoading ? 'Carregando…' : 'Indisponível'}</dd>
            </div>
          </dl>

          <p className="account-panel__note">
            Nome, PIN e classificação etária são ajustados na seleção de perfis. A conta não expõe identificadores internos,
            tokens ou credenciais nesta área.
          </p>
        </section>

        <section className="account-panel" aria-labelledby="account-preferences-title">
          <div className="account-panel__heading">
            <h2 id="account-preferences-title" className="account-panel__title">Preferências de reprodução</h2>
          </div>

          {preferences.isLoading && (
            <div className="account-panel__loading" aria-busy="true">
              <p role="status">Carregando preferências do perfil…</p>
              <Skeleton variant="text" count={3} />
            </div>
          )}

          {!preferences.isLoading && preferences.isError && (
            <CatalogMessage
              tone="error"
              icon="info"
              title="Não foi possível carregar as preferências"
              description="As preferências continuam salvas no perfil. Verifique a conexão e tente novamente."
              actions={<button type="button" className="btn btn--primary" onClick={() => { void preferences.refetch(); }}>Tentar novamente</button>}
            />
          )}

          {!preferences.isLoading && !preferences.isError && draft && (
            <form
              className="account-preferences"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft) savePreferences.mutate(draft);
              }}
            >
              <label className="account-field">
                <span className="account-field__label">Próximo episódio automaticamente</span>
                <span className="account-field__hint">Quando o episódio terminar, o player poderá iniciar o próximo.</span>
                <select
                  value={draft.autoplayNextEpisode ? 'on' : 'off'}
                  disabled={savePreferences.isPending}
                  onChange={(event) => updateDraft({ autoplayNextEpisode: event.target.value === 'on' })}
                >
                  <option value="on">Ativado</option>
                  <option value="off">Desativado</option>
                </select>
              </label>

              <label className="account-field">
                <span className="account-field__label">Tamanho das legendas</span>
                <span className="account-field__hint">Aplicado às legendas exibidas pelo player neste perfil.</span>
                <select
                  value={draft.subtitleStyle}
                  disabled={savePreferences.isPending}
                  onChange={(event) => updateDraft({ subtitleStyle: event.target.value as ProfilePreferences['subtitleStyle'] })}
                >
                  <option value="small">Pequeno</option>
                  <option value="medium">Médio</option>
                  <option value="large">Grande</option>
                </select>
              </label>

              <p className="account-panel__note" id={preferencesNoteId}>
                A escolha de faixa de áudio ou de legenda durante a reprodução é temporária e feita no player.
                Qualidade, velocidade e idiomas não são apresentados aqui porque não existem como preferências persistentes neste perfil.
              </p>

              <div className="account-preferences__actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={!isDirty || savePreferences.isPending}
                  aria-describedby={preferencesNoteId}
                >
                  {savePreferences.isPending ? 'Salvando…' : 'Salvar preferências'}
                </button>
                {feedback && <p className="account-feedback" role="status">{feedback}</p>}
              </div>

              {savePreferences.isError && (
                <p className="account-feedback account-feedback--error" role="alert">
                  Não foi possível salvar as preferências. Verifique a conexão e tente novamente.
                </p>
              )}
            </form>
          )}
        </section>
      </div>

      <section className="account-panel account-panel--shortcuts" aria-labelledby="account-shortcuts-title">
        <div className="account-panel__heading">
          <h2 id="account-shortcuts-title" className="account-panel__title">Acesso rápido</h2>
        </div>
        <div className="account-shortcuts">
          <Link to="/my-list" className="account-shortcut">
            <span className="account-shortcut__icon" aria-hidden="true"><Icon name="check" /></span>
            <span>
              <strong>Minha Lista</strong>
              <small>Retome os títulos que você salvou.</small>
            </span>
            <Icon name="chevron-right" />
          </Link>
          <Link to="/profiles" className="account-shortcut">
            <span className="account-shortcut__icon" aria-hidden="true"><Icon name="user" /></span>
            <span>
              <strong>Perfis</strong>
              <small>Troque de perfil ou ajuste nome, PIN e classificação.</small>
            </span>
            <Icon name="chevron-right" />
          </Link>
          <Link to="/browse" className="account-shortcut">
            <span className="account-shortcut__icon" aria-hidden="true"><Icon name="play" /></span>
            <span>
              <strong>Início</strong>
              <small>Continue assistindo e explore o catálogo.</small>
            </span>
            <Icon name="chevron-right" />
          </Link>
        </div>
        <div className="account-session">
          <p>Encerrar a sessão neste navegador remove os dados pessoais mantidos em cache.</p>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={loggingOut}
            onClick={() => { void logout(); }}
          >
            <Icon name="logout" />
            {loggingOut ? 'Saindo…' : 'Sair da conta'}
          </button>
        </div>
      </section>
    </div>
  );
}
