import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useFavoriteMutation } from '../../hooks/useFavoriteMutation';
import { useProfileStore } from '../../stores/useProfileStore';
import { formatDuration, formatMs, getCertification, labelKind } from '../../lib/utils';
import { getReleaseDate, getRuntimeMinutes } from '../../lib/workDetails';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import type { PlaybackDetails, Work } from '../../lib/types';

export function WatchDetails({ details }: { details: PlaybackDetails }) {
  const profileId = useProfileStore((state) => state.profileId);
  const queryClient = useQueryClient();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [favoriteFeedback, setFavoriteFeedback] = useState('');
  const [shareFeedback, setShareFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const work = useMemo<Work>(() => ({
    id: details.workId,
    title: details.title,
    originalTitle: details.originalTitle,
    contentKind: details.contentKind,
    year: details.year,
    synopsis: details.synopsis,
    metadata: details.metadata,
  }), [details]);

  const favorites = useQuery({
    queryKey: ['favorites', profileId],
    queryFn: () => api.getFavorites(profileId!),
    enabled: Boolean(profileId),
  });
  const favoriteMutation = useFavoriteMutation(profileId);
  const rating = useQuery({
    queryKey: ['work-rating', profileId, details.workId],
    queryFn: () => api.getWorkRating(profileId!, details.workId),
    enabled: Boolean(profileId),
  });
  const ratingMutation = useMutation({
    mutationFn: (value: 1 | -1 | 0) => {
      if (!profileId) throw new Error('Perfil indisponível');
      return api.setWorkRating(profileId, details.workId, value);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['work-rating', profileId, details.workId], data);
      setActionError('');
    },
    onError: () => setActionError('Não foi possível salvar sua avaliação.'),
  });

  useEffect(() => {
    setSynopsisExpanded(false);
    setFavoriteFeedback('');
    setShareFeedback('');
    setActionError('');
  }, [details.workId, details.episode?.id]);

  useEffect(() => {
    if (!favoriteFeedback) return;
    const timer = window.setTimeout(() => setFavoriteFeedback(''), 5000);
    return () => window.clearTimeout(timer);
  }, [favoriteFeedback]);

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => setShareFeedback(''), 5000);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  useEffect(() => {
    if (!favoriteMutation.isSuccess || favoriteMutation.variables?.work.id !== details.workId) return;
    setFavoriteFeedback(favoriteMutation.variables.nextFavorite
      ? `“${details.title}” foi adicionado à Minha Lista.`
      : `“${details.title}” foi removido da Minha Lista.`);
  }, [details.title, details.workId, favoriteMutation.isSuccess, favoriteMutation.variables]);

  if (!profileId) return null;

  const episode = details.episode;
  const season = details.season;
  const isEpisode = Boolean(episode);
  const seasonMetadata = season?.metadata;
  const episodeMetadata = episode?.metadata;
  const certification = getCertification(details.metadata)
    ?? getCertification(seasonMetadata)
    ?? getCertification(episodeMetadata);
  const releaseDate = isEpisode
    ? getReleaseDate(episodeMetadata) ?? getReleaseDate(seasonMetadata) ?? getReleaseDate(details.metadata)
    : getReleaseDate(details.metadata);
  const audioLanguages = uniqueStrings([
    ...stringArray(episodeMetadata?.audio_languages),
    ...stringArray(seasonMetadata?.audio_languages),
    ...stringArray(details.metadata?.audio_languages),
  ]).filter((language) => !/indispon/i.test(language));
  const subtitleLanguages = uniqueStrings([
    ...stringArray(episodeMetadata?.subtitle_languages),
    ...stringArray(seasonMetadata?.subtitle_languages),
    ...stringArray(details.metadata?.subtitle_languages),
  ]).filter((language) => !/indispon/i.test(language));
  const synopsis = (isEpisode ? episode?.synopsis : details.synopsis)?.trim() ?? '';
  const synopsisIsLong = synopsis.length > 380 || synopsis.split(/\r?\n/).length > 4;
  const isFavorite = Boolean(favorites.data?.some((item) => item.id === details.workId));
  const episodeTitle = episode?.title?.trim() || (episode ? `Episódio ${episode.number}` : null);
  const nextEpisode = details.nextEpisode;
  const nextCertification = nextEpisode
    ? getCertification(details.metadata) ?? getCertification(nextEpisode.seasonMetadata)
    : null;
  const nextTitle = nextEpisode?.title?.trim() || (nextEpisode ? `Episódio ${nextEpisode.number}` : null);
  const nextDurationMinutes = getRuntimeMinutes(nextEpisode?.metadata);
  const nextDurationLabel = nextDurationMinutes
    ? formatDuration(nextDurationMinutes)
    : nextEpisode?.progress?.durationSeconds ? formatMs(nextEpisode.progress.durationSeconds * 1000) : null;
  const nextProgress = nextEpisode?.progress && nextEpisode.progress.positionSeconds > 0
    ? Math.min(100, Math.max(0, nextEpisode.progress.progressPercent))
    : 0;
  const nextRemaining = nextEpisode?.progress?.durationSeconds
    ? Math.max(0, nextEpisode.progress.durationSeconds - nextEpisode.progress.positionSeconds)
    : 0;
  const favoritePending = favoriteMutation.isPending;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const currentRating = rating.data?.value ?? null;
  const likes = rating.data?.likes ?? 0;
  const dislikes = rating.data?.dislikes ?? 0;
  const shareTitle = isEpisode && episodeTitle ? `${details.title} — ${episodeTitle}` : details.title;

  const handleFavorite = () => {
    setFavoriteFeedback('');
    favoriteMutation.mutate({ work, nextFavorite: !isFavorite });
  };

  const handleRating = (value: 1 | -1) => {
    setActionError('');
    ratingMutation.mutate(currentRating === value ? 0 : value);
  };

  const handleShare = async () => {
    setShareFeedback('');
    const url = window.location.href;
    try {
      if (canNativeShare) {
        await navigator.share({ title: shareTitle, text: `Assista a ${shareTitle} no CyanFlix`, url });
        setShareFeedback('Compartilhamento aberto.');
        return;
      }
      await copyText(url);
      setShareFeedback('Link copiado.');
    } catch (error) {
      if (isAbortError(error)) return;
      try {
        await copyText(url);
        setShareFeedback('Link copiado.');
      } catch {
        setShareFeedback('Não foi possível compartilhar. Copie o endereço do navegador.');
      }
    }
  };

  const handleCopyLink = async () => {
    setShareFeedback('');
    try {
      await copyText(window.location.href);
      setShareFeedback('Link copiado.');
    } catch {
      setShareFeedback('Não foi possível copiar o link.');
    }
  };

  return (
    <section className={`watch-details${isEpisode ? ' watch-details--episode' : ''}`} aria-labelledby="watch-title">
      <div className="watch-details__main">
        <div className="watch-details__heading">
          <p className="watch-details__eyebrow">
            {isEpisode ? (
              <>
                <span>{labelKind(details.contentKind)}</span>
                {season && <span aria-hidden="true">·</span>}
                {season && <span>Temporada {season.number}</span>}
                {episode && <span aria-hidden="true">·</span>}
                {episode && <span>Episódio {episode.number}</span>}
              </>
            ) : (
              <span>{labelKind(details.contentKind)}</span>
            )}
          </p>
          <h1 id="watch-title" className="watch-details__title">
            {isEpisode ? (
              <Link to={`/title/${details.workId}${season ? `?season=${season.number}` : ''}`} className="watch-details__work-link">
                {details.title}
              </Link>
            ) : details.title}
          </h1>
          {isEpisode && episodeTitle && <h2 className="watch-details__episode-title">{episodeTitle}</h2>}
        </div>

        <div className="watch-details__meta">
          {certification && <Badge variant="age" label={certification} />}
          {releaseDate && (
            <span className="watch-details__meta-item">
              <span className="watch-details__meta-label">Lançamento</span> {releaseDate}
            </span>
          )}
          {details.year && !releaseDate && <span className="watch-details__meta-item">{details.year}</span>}
          {isEpisode && episode && (
            <span className="watch-details__meta-item">
              <span className="watch-details__meta-label">Episódio</span> {episode.number}
            </span>
          )}
        </div>

        {(audioLanguages.length > 0 || subtitleLanguages.length > 0) && (
          <div className="watch-details__languages" aria-label="Idiomas disponíveis">
            {audioLanguages.length > 0 && (
              <span><strong>Áudio</strong> {audioLanguages.join(', ')}</span>
            )}
            {subtitleLanguages.length > 0 && (
              <span><strong>Legendas</strong> {subtitleLanguages.join(', ')}</span>
            )}
          </div>
        )}

        <div className="watch-details__actions" role="group" aria-label="Ações do título">
          <button
            type="button"
            className={`watch-action${isFavorite ? ' watch-action--active' : ''}`}
            aria-pressed={isFavorite}
            disabled={favorites.isLoading || favorites.isError || favoritePending}
            onClick={handleFavorite}
          >
            <Icon name={isFavorite ? 'check' : 'plus'} />
            <span>{favoritePending ? 'Salvando…' : isFavorite ? 'Na Minha Lista' : 'Minha Lista'}</span>
          </button>

          <div className="watch-rating" role="group" aria-label="Avaliar título">
            <button
              type="button"
              className={`watch-action watch-action--icon${currentRating === 1 ? ' watch-action--active' : ''}`}
              aria-pressed={currentRating === 1}
              aria-label={likes > 0 ? `Curtir, ${likes} ${likes === 1 ? 'curtida' : 'curtidas'}` : 'Curtir'}
              disabled={rating.isLoading || ratingMutation.isPending}
              onClick={() => handleRating(1)}
            >
              <Icon name="thumbs-up" />
              <span>Curtir</span>
              {likes > 0 && <span className="watch-action__count">{likes}</span>}
            </button>
            <button
              type="button"
              className={`watch-action watch-action--icon${currentRating === -1 ? ' watch-action--active' : ''}`}
              aria-pressed={currentRating === -1}
              aria-label={dislikes > 0 ? `Não curtir, ${dislikes} ${dislikes === 1 ? 'reação' : 'reações'}` : 'Não curtir'}
              disabled={rating.isLoading || ratingMutation.isPending}
              onClick={() => handleRating(-1)}
            >
              <Icon name="thumbs-down" />
              <span>Não curtir</span>
              {dislikes > 0 && <span className="watch-action__count">{dislikes}</span>}
            </button>
          </div>

          <button type="button" className="watch-action" onClick={() => { void handleShare(); }}>
            <Icon name="share" />
            <span>Compartilhar</span>
          </button>
          {canNativeShare && (
            <button type="button" className="watch-action watch-action--icon" onClick={() => { void handleCopyLink(); }} aria-label="Copiar link">
              <Icon name="link" />
              <span>Copiar link</span>
            </button>
          )}
        </div>

        {favoriteFeedback && <p className="watch-details__feedback" role="status">{favoriteFeedback}</p>}
        {shareFeedback && <p className="watch-details__feedback" role="status">{shareFeedback}</p>}
        {favoriteMutation.isError && (
          <p className="watch-details__feedback watch-details__feedback--error" role="alert">
            Não foi possível atualizar a Minha Lista. Sua seleção anterior foi preservada.
          </p>
        )}
        {rating.isError && (
          <p className="watch-details__feedback watch-details__feedback--error" role="alert">
            Não foi possível carregar as avaliações deste título.
          </p>
        )}
        {actionError && (
          <p className="watch-details__feedback watch-details__feedback--error" role="alert">{actionError}</p>
        )}

        {synopsis && (
          <div className="watch-details__synopsis-block">
            <p
              id="watch-synopsis"
              className={`watch-details__synopsis${synopsisIsLong && !synopsisExpanded ? ' watch-details__synopsis--clamped' : ''}`}
            >
              {synopsis}
            </p>
            {synopsisIsLong && (
              <button
                type="button"
                className="watch-details__synopsis-toggle"
                aria-expanded={synopsisExpanded}
                aria-controls="watch-synopsis"
                onClick={() => setSynopsisExpanded((expanded) => !expanded)}
              >
                {synopsisExpanded ? 'Mostrar menos' : 'Mostrar mais'}
              </button>
            )}
          </div>
        )}
      </div>

      {isEpisode && season && (
        <aside className="watch-details__aside" aria-label="Navegação da série">
          {nextEpisode && nextTitle && (
            <section className="watch-next" aria-labelledby="watch-next-title">
              <h2 id="watch-next-title" className="watch-side__title">Próximo episódio</h2>
              <Link
                to={`/watch/episode/${nextEpisode.id}`}
                className="watch-next__card"
                aria-label={`Assistir ao próximo episódio: T${nextEpisode.seasonNumber} E${nextEpisode.number}, ${nextTitle}`}
              >
                <span className="watch-next__thumbnail">
                  {nextEpisode.thumbnail ? (
                    <img src={nextEpisode.thumbnail} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="watch-next__placeholder" aria-hidden="true"><Icon name="play" /></span>
                  )}
                  <span className="watch-next__play" aria-hidden="true"><Icon name="play" /></span>
                  {nextProgress > 0 && (
                    <span className="watch-next__progress">
                      <progress
                        value={nextProgress}
                        max="100"
                        aria-label={`${Math.round(nextProgress)}% assistido do próximo episódio`}
                      />
                    </span>
                  )}
                </span>
                <span className="watch-next__copy">
                  <span className="watch-next__context">
                    <span>T{nextEpisode.seasonNumber} E{nextEpisode.number}</span>
                    {nextCertification && <Badge variant="age" label={nextCertification} />}
                  </span>
                  <strong className="watch-next__title">{nextTitle}</strong>
                  <span className="watch-next__meta">
                    {nextDurationLabel}
                    {nextDurationLabel && nextProgress > 0 && <span aria-hidden="true"> · </span>}
                    {nextProgress > 0 && nextRemaining > 0 && `${formatMs(nextRemaining * 1000)} restantes`}
                  </span>
                </span>
              </Link>
            </section>
          )}

          <section className="watch-more" aria-labelledby="watch-more-title">
            <h2 id="watch-more-title" className="watch-side__title">Mais episódios</h2>
            <p className="watch-more__text">
              Temporada {season.number}
              {season.title ? ` · ${season.title}` : ''}
            </p>
            <Link to={`/title/${details.workId}?season=${season.number}`} className="btn btn--secondary watch-more__action">
              Ver todos os episódios
            </Link>
          </section>
        </aside>
      )}
    </section>
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy unavailable');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
