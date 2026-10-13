import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { useProfileStore } from '../stores/useProfileStore';

export function WatchPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.profileId);

  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['playback', id],
    queryFn: () => api.getPlayback(id!),
    enabled: !!id,
  });
  const progress = useQuery({
    queryKey: ['progress', profileId, id],
    queryFn: () => api.getProgress(profileId!, id!),
    enabled: Boolean(profileId && id),
  });
  const [lastSavedSecond, setLastSavedSecond] = useState(0);

  // Polling for fallback job if needed
  useEffect(() => {
    let interval: number;
    if (pollingJobId) {
      interval = window.setInterval(async () => {
        try {
          const job = await api.getFallbackJob(pollingJobId);
          if ((job.status === 'completed' || job.status === 'finished') && job.url) {
            setFallbackUrl(job.url);
            setPollingJobId(null);
          } else if (job.status === 'failed') {
            setPollingJobId(null);
            console.error('Fallback job failed');
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [pollingJobId]);

  const requestFallback = useCallback(async () => {
    if (!id) return;
    try {
      const job = await api.requestFallback(id);
      if ((job.status === 'completed' || job.status === 'finished') && job.url) {
        setFallbackUrl(job.url);
        setPollingJobId(null);
      } else if (job.jobId) {
        setPollingJobId(job.jobId);
      }
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  if (isLoading) {
    return (
      <div style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--cyan)', fontSize: '2rem' }}>Carregando...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
        <div style={{ color: 'white', fontSize: '1.5rem' }}>Erro ao carregar o vídeo.</div>
        <button onClick={() => navigate(-1)} style={{ padding: '10px 20px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Voltar
        </button>
      </div>
    );
  }

  const handleNextEpisode = () => {
    if (data.nextEpisode) {
      navigate(`/watch/episode/${data.nextEpisode.id}`);
    }
  };

  const src = fallbackUrl || data.fallback?.url || data.originalUrl;

  return (
    <div style={{ background: '#000', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <VideoPlayer
        src={src}
        title={data.title}
        markers={data.markers}
        subtitles={data.subtitles}
        nextEpisode={data.nextEpisode}
        onBack={() => navigate(-1)}
        onNextEpisode={handleNextEpisode}
        startTime={progress.data?.completed ? 0 : progress.data?.positionSeconds}
        onTimeUpdate={(positionSeconds, durationSeconds) => {
          const second = Math.floor(positionSeconds);
          if (!profileId || !id || second - lastSavedSecond < 15) return;
          setLastSavedSecond(second);
          void api.updateProgress(profileId, id, { positionSeconds: second, durationSeconds: Math.floor(durationSeconds) });
        }}
        onPlaybackError={fallbackUrl || pollingJobId ? undefined : requestFallback}
      />
      {/* Optionally render fallback request button here if src fails or data.fallback.available */}
      {!fallbackUrl && !data.fallback?.url && data.fallback?.available && !pollingJobId && (
        <button 
          onClick={requestFallback}
          style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
        >
          Forçar Transcodificação (H.264)
        </button>
      )}
      {pollingJobId && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px 10px', borderRadius: '4px' }}>
          Transcodificando...
        </div>
      )}
    </div>
  );
}
