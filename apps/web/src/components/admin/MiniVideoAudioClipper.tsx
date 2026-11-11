import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { api } from "../../lib/api";

type ClipItem = {
  mediaUrl: string;
  sourceLabel: string;
  startSeconds: number;
  durationSeconds: number;
};

type Props = {
  workId: string;
  currentVoiceAudioUrl?: string | null;
  onVoiceAudioChange: (url: string | null) => void;
};

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${remM.toString().padStart(2, "0")}:${remS.toString().padStart(2, "0")}`;
  }
  return `${remM.toString().padStart(2, "0")}:${remS.toString().padStart(2, "0")}`;
}

export function MiniVideoAudioClipper({ workId, currentVoiceAudioUrl, onVoiceAudioChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const [clipStart, setClipStart] = useState<number>(0);
  const [clipDuration, setClipDuration] = useState<number>(15);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: playableData, isLoading } = useQuery({
    queryKey: ["admin", "work-playable-sources", workId],
    queryFn: () => (workId ? api.getWorkPlayableSources(workId) : null),
    enabled: Boolean(workId),
  });

  const sources = playableData?.sources || [];

  // Auto-select first source if available
  useEffect(() => {
    if (sources.length > 0 && !selectedSourceUrl) {
      setSelectedSourceUrl(sources[0].mediaUrl);
    }
  }, [sources, selectedSourceUrl]);

  // Setup video playback with Hls.js or native
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedSourceUrl) return;

    let hls: Hls | null = null;
    const isHls = selectedSourceUrl.endsWith(".m3u8");

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(selectedSourceUrl);
      hls.attachMedia(video);
    } else {
      video.src = selectedSourceUrl;
    }

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      if (hls) {
        hls.destroy();
      }
    };
  }, [selectedSourceUrl]);

  const handleMarkStart = () => {
    const time = Math.floor(currentTime);
    setClipStart(time);
  };

  const handleMarkEnd = () => {
    const end = Math.floor(currentTime);
    if (end > clipStart) {
      setClipDuration(end - clipStart);
    }
  };

  const handleAddClip = () => {
    if (!selectedSourceUrl) return;
    const sourceObj = sources.find((s) => s.mediaUrl === selectedSourceUrl);
    const sourceLabel = sourceObj ? sourceObj.label : "Trecho";

    if (clipDuration <= 0) {
      setErrorMessage("A duração do trecho deve ser maior que 0.");
      return;
    }

    setClips((prev) => [
      ...prev,
      {
        mediaUrl: selectedSourceUrl,
        sourceLabel,
        startSeconds: clipStart,
        durationSeconds: clipDuration,
      },
    ]);
    setErrorMessage(null);
  };

  const handleRemoveClip = (index: number) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerateVoice = async () => {
    if (clips.length === 0) {
      setErrorMessage("Adicione pelo menos um trecho de áudio para gerar.");
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await api.extractCharacterVoice(
        clips.map((c) => ({
          mediaUrl: c.mediaUrl,
          startSeconds: c.startSeconds,
          durationSeconds: c.durationSeconds,
        }))
      );
      onVoiceAudioChange(res.voiceAudioUrl);
      setClips([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage("Erro ao extrair áudio com FFmpeg: " + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAudio(true);
    setErrorMessage(null);
    try {
      const res = await api.uploadCharacterAudio(file);
      onVoiceAudioChange(res.voiceAudioUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage("Erro ao enviar arquivo de áudio: " + msg);
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  return (
    <div className="admin-mini-clipper">
      {currentVoiceAudioUrl && (
        <div className="admin-voice-sample-card" style={{ padding: "1rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              ✓ Amostra de Voz Anexada
            </span>
            <button
              type="button"
              className="btn btn--danger btn--xs"
              onClick={() => onVoiceAudioChange(null)}
            >
              Remover Áudio
            </button>
          </div>
          <audio controls src={currentVoiceAudioUrl} style={{ width: "100%", height: "36px", marginTop: "0.5rem" }} />
        </div>
      )}

      {errorMessage && (
        <div className="admin-alert admin-alert--danger">{errorMessage}</div>
      )}

      {/* Clipper Mode */}
      {isLoading ? (
        <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Carregando mídias da obra…</p>
      ) : sources.length === 0 ? (
        <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "1rem", borderRadius: "0.5rem", border: "1px dashed rgba(255,255,255,0.1)" }}>
          <p style={{ color: "#cbd5e1", fontSize: "0.85rem", margin: "0 0 0.75rem 0" }}>
            Esta obra ainda não possui episódios ou mídias publicadas para recorte de voz pelo player.
          </p>
          <input
            type="file"
            ref={audioInputRef}
            onChange={handleAudioUpload}
            accept="audio/*"
            style={{ display: "none" }}
            id="char-audio-direct-upload"
          />
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => audioInputRef.current?.click()}
            disabled={isUploadingAudio}
          >
            {isUploadingAudio ? "Enviando áudio…" : "📁 Enviar Áudio do Computador"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label className="admin-label" style={{ fontSize: "0.82rem" }}>
              🎬 Selecione o Episódio ou Mídia para ouvir e marcar falas:
            </label>
            <select
              className="admin-select"
              value={selectedSourceUrl}
              onChange={(e) => setSelectedSourceUrl(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.mediaUrl}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-mini-clipper__video-wrap">
            <video
              ref={videoRef}
              controls
              playsInline
              className="admin-mini-clipper__video"
            />
          </div>

          <div className="admin-mini-clipper__controls">
            <div className="admin-mini-clipper__time-display">
              ⏱️ {formatSeconds(currentTime)} / {formatSeconds(duration)}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                onClick={handleMarkStart}
                title="Define o início do trecho no ponto atual do vídeo"
              >
                Início: {formatSeconds(clipStart)}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                onClick={handleMarkEnd}
                title="Define o fim do trecho no ponto atual do vídeo"
              >
                Fim: {formatSeconds(clipStart + clipDuration)}
              </button>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                ({clipDuration}s)
              </span>
              <button
                type="button"
                className="btn btn--primary btn--xs"
                onClick={handleAddClip}
                title="Adiciona este trecho à lista de gravação"
              >
                ➕ Gravar Trecho ({clipDuration}s)
              </button>
            </div>
          </div>

          {/* Queue of clips */}
          {clips.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#38bdf8", marginBottom: "0.35rem" }}>
                Trechos Selecionados ({clips.length}):
              </div>
              <div className="admin-mini-clipper__clip-list">
                {clips.map((clip, idx) => (
                  <div key={idx} className="admin-mini-clipper__clip-item">
                    <span>
                      <strong>#{idx + 1} {clip.sourceLabel}:</strong> {formatSeconds(clip.startSeconds)} até {formatSeconds(clip.startSeconds + clip.durationSeconds)} ({clip.durationSeconds}s)
                    </span>
                    <button
                      type="button"
                      className="btn btn--danger btn--xs"
                      onClick={() => handleRemoveClip(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleGenerateVoice}
                  disabled={isProcessing}
                >
                  {isProcessing ? "⏳ Processando com FFmpeg no servidor…" : `✨ Gerar Áudio Final (${clips.length} trechos)`}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  onClick={() => setClips([])}
                  disabled={isProcessing}
                >
                  Limpar Trechos
                </button>
              </div>
            </div>
          )}

          {/* Direct audio upload option */}
          <div style={{ marginTop: "0.85rem", paddingTop: "0.85rem", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
              Ou se já possuir o arquivo de áudio extraído no computador:
            </span>
            <input
              type="file"
              ref={audioInputRef}
              onChange={handleAudioUpload}
              accept="audio/*"
              style={{ display: "none" }}
              id="char-audio-alt-upload"
            />
            <button
              type="button"
              className="btn btn--secondary btn--xs"
              onClick={() => audioInputRef.current?.click()}
              disabled={isUploadingAudio}
            >
              {isUploadingAudio ? "Enviando…" : "📁 Enviar Áudio do PC"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
