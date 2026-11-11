import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { api } from "../../lib/api";
import { applyAudioInitPts, audioInitPtsForOffset, isSafariBrowser } from "../../lib/player";

type ClipItem = {
  mediaUrl: string;
  sourceLabel: string;
  startSeconds: number;
  durationSeconds: number;
  audioOffsetSeconds?: number;
};

type AudioTrackOption = {
  id: number;
  label: string;
  lang?: string;
};

type Props = {
  workId: string;
  currentVoiceAudioUrl?: string | null;
  onVoiceAudioChange: (url: string | null) => void;
  onSaveDirect?: (voiceAudioUrl: string) => Promise<void>;
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

export function MiniVideoAudioClipper({ workId, currentVoiceAudioUrl, onVoiceAudioChange, onSaveDirect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const [clipStart, setClipStart] = useState<number>(0);
  const [clipEnd, setClipEnd] = useState<number>(0);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDirectSaving, setIsDirectSaving] = useState<boolean>(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [audioOffset, setAudioOffset] = useState<number>(0);
  const audioOffsetRef = useRef<number>(0);

  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(-1);

  const previewEndRef = useRef<number | null>(null);

  const { data: playableData, isLoading } = useQuery({
    queryKey: ["admin", "work-playable-sources", workId],
    queryFn: () => (workId ? api.getWorkPlayableSources(workId) : null),
    enabled: Boolean(workId),
  });

  const sources = playableData?.sources || [];
  const selectedSource = sources.find((s) => s.mediaUrl === selectedSourceUrl);

  // Auto-select first source if available
  useEffect(() => {
    if (sources.length > 0 && !selectedSourceUrl) {
      setSelectedSourceUrl(sources[0].mediaUrl);
    }
  }, [sources, selectedSourceUrl]);

  // Sync offset when source changes
  useEffect(() => {
    if (selectedSource) {
      const declared = selectedSource.audioOffsetSeconds ?? 0;
      setAudioOffset(declared);
      audioOffsetRef.current = declared;
    }
  }, [selectedSource]);

  const updateAudioOffset = (newOffset: number) => {
    setAudioOffset(newOffset);
    audioOffsetRef.current = newOffset;
    const hls = hlsRef.current;
    if (hls) {
      const controller = (hls as unknown as { audioStreamController?: { initPTS?: Array<{ baseTime: number; timescale: number; trackId: number }> } })?.audioStreamController;
      if (controller?.initPTS) {
        controller.initPTS[0] = audioInitPtsForOffset(newOffset, 90000, 1);
      }
      const video = videoRef.current;
      if (video) {
        video.currentTime = video.currentTime;
      }
    }
  };

  // Setup video playback with Hls.js or native
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedSourceUrl) return;

    let hls: Hls | null = null;
    const isHls = selectedSourceUrl.endsWith(".m3u8");

    if (isHls && Hls.isSupported() && !isSafariBrowser()) {
      hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;

      hls.on(Hls.Events.INIT_PTS_FOUND, (_event, data) => {
        applyAudioInitPts(hls, data, audioOffsetRef.current);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (!hls) return;
        const tracks: AudioTrackOption[] = hls.audioTracks.map((track, idx) => ({
          id: idx,
          label: track.name || `Faixa ${idx + 1}`,
          lang: track.lang || undefined,
        }));
        setAudioTracks(tracks);

        // Auto select Portuguese dub if available
        const porIdx = tracks.findIndex(
          (t) => /por|pt|dub/i.test(t.lang || "") || /portug/i.test(t.label)
        );
        if (porIdx >= 0) {
          hls.audioTrack = porIdx;
          setSelectedAudioTrack(porIdx);
        } else if (hls.audioTrack >= 0) {
          setSelectedAudioTrack(hls.audioTrack);
        }
      });

      hls.loadSource(selectedSourceUrl);
      hls.attachMedia(video);
    } else {
      video.src = selectedSourceUrl;
    }

    const onTimeUpdate = () => {
      const ct = video.currentTime;
      setCurrentTime(ct);
      if (previewEndRef.current !== null && ct >= previewEndRef.current) {
        video.pause();
        previewEndRef.current = null;
      }
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
        hlsRef.current = null;
      }
    };
  }, [selectedSourceUrl]);

  const handleMarkStart = () => {
    const time = Math.floor(currentTime);
    setClipStart(time);
    if (clipEnd <= time) {
      setClipEnd(time + 10);
    }
  };

  const handleMarkEnd = () => {
    const time = Math.ceil(currentTime);
    setClipEnd(time);
  };

  const clipDuration = Math.max(0, +(clipEnd - clipStart).toFixed(1));

  const handlePreviewClip = () => {
    const video = videoRef.current;
    if (!video) return;
    if (clipEnd <= clipStart) {
      setErrorMessage("O tempo de término deve ser maior que o de início para reproduzir a prévia.");
      return;
    }
    setErrorMessage(null);
    video.currentTime = clipStart;
    previewEndRef.current = clipEnd;
    video.play().catch(() => {});
  };

  const handleAddClip = () => {
    if (!selectedSourceUrl) return;
    const sourceObj = sources.find((s) => s.mediaUrl === selectedSourceUrl);
    const sourceLabel = sourceObj ? sourceObj.label : "Trecho";

    if (clipEnd <= clipStart) {
      setErrorMessage("O tempo de término deve ser maior que o tempo de início.");
      return;
    }

    setClips((prev) => [
      ...prev,
      {
        mediaUrl: selectedSourceUrl,
        sourceLabel,
        startSeconds: clipStart,
        durationSeconds: clipDuration,
        audioOffsetSeconds: audioOffset,
      },
    ]);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleRemoveClip = (index: number) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlayClipSnippet = (clip: ClipItem) => {
    if (clip.mediaUrl !== selectedSourceUrl) {
      setSelectedSourceUrl(clip.mediaUrl);
    }
    setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = clip.startSeconds;
      previewEndRef.current = clip.startSeconds + clip.durationSeconds;
      video.play().catch(() => {});
    }, 100);
  };

  const handleGenerateVoice = async () => {
    if (clips.length === 0) {
      setErrorMessage("Adicione pelo menos um trecho de áudio para gerar.");
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await api.extractCharacterVoice(
        clips.map((c) => ({
          mediaUrl: c.mediaUrl,
          startSeconds: c.startSeconds,
          durationSeconds: c.durationSeconds,
          audioOffsetSeconds: c.audioOffsetSeconds,
        }))
      );
      onVoiceAudioChange(res.voiceAudioUrl);
      setClips([]);

      if (onSaveDirect) {
        try {
          await onSaveDirect(res.voiceAudioUrl);
          setSuccessMessage("✅ Áudio extraído pelo FFmpeg e salvo no personagem com sucesso!");
        } catch {
          setSuccessMessage("✓ Áudio extraído com sucesso! Clique em 'Salvar Alterações' para confirmar.");
        }
      } else {
        setSuccessMessage("✓ Áudio extraído com sucesso! Não esqueça de clicar em Cadastrar/Salvar abaixo.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage("Erro ao extrair áudio com FFmpeg: " + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectSave = async () => {
    if (!currentVoiceAudioUrl || !onSaveDirect) return;
    setIsDirectSaving(true);
    setErrorMessage(null);
    try {
      await onSaveDirect(currentVoiceAudioUrl);
      setSuccessMessage("✅ Amostra de áudio salva no personagem com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage("Erro ao salvar áudio no personagem: " + msg);
    } finally {
      setIsDirectSaving(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAudio(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await api.uploadCharacterAudio(file);
      onVoiceAudioChange(res.voiceAudioUrl);
      if (onSaveDirect) {
        try {
          await onSaveDirect(res.voiceAudioUrl);
          setSuccessMessage("✅ Arquivo enviado e salvo no personagem com sucesso!");
        } catch {
          setSuccessMessage("✓ Arquivo anexado! Clique em Salvar para confirmar.");
        }
      } else {
        setSuccessMessage("✓ Arquivo anexado! Não esqueça de salvar o formulário.");
      }
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
        <div className="admin-voice-sample-card" style={{ padding: "1rem", marginBottom: "0.75rem", border: "1px solid #10b981", background: "rgba(16, 185, 129, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              ✓ Amostra de Voz Anexada
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {onSaveDirect && (
                <button
                  type="button"
                  className="btn btn--primary btn--xs"
                  onClick={handleDirectSave}
                  disabled={isDirectSaving}
                >
                  {isDirectSaving ? "Salvando…" : "💾 Salvar no Personagem Agora"}
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger btn--xs"
                onClick={() => onVoiceAudioChange(null)}
              >
                Remover Áudio
              </button>
            </div>
          </div>
          <audio controls src={currentVoiceAudioUrl} style={{ width: "100%", height: "36px", marginTop: "0.5rem" }} />
        </div>
      )}

      {errorMessage && (
        <div className="admin-alert admin-alert--danger" style={{ marginBottom: "0.75rem" }}>{errorMessage}</div>
      )}

      {successMessage && (
        <div className="admin-alert" style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid #10b981", color: "#34d399", marginBottom: "0.75rem", padding: "0.6rem 0.85rem", borderRadius: "0.375rem" }}>
          {successMessage}
        </div>
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
          <div style={{ display: "grid", gridTemplateColumns: audioTracks.length > 1 ? "1fr 1fr" : "1fr", gap: "0.75rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label className="admin-label" style={{ fontSize: "0.82rem" }}>
                🎬 Selecione o Episódio ou Mídia:
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

            {audioTracks.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label className="admin-label" style={{ fontSize: "0.82rem" }}>
                  🎙️ Faixa de Áudio (Dublagem):
                </label>
                <select
                  className="admin-select"
                  value={selectedAudioTrack}
                  onChange={(e) => {
                    const trackId = Number(e.target.value);
                    setSelectedAudioTrack(trackId);
                    if (hlsRef.current) hlsRef.current.audioTrack = trackId;
                  }}
                >
                  {audioTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} {t.lang ? `(${t.lang.toUpperCase()})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="admin-mini-clipper__video-wrap" style={{ marginTop: "0.6rem" }}>
            <video
              ref={videoRef}
              controls
              playsInline
              className="admin-mini-clipper__video"
            />
          </div>

          <div className="admin-mini-clipper__controls" style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginTop: "0.5rem" }}>
            {/* Audio Synchronization Offset Control */}
            <div style={{ background: "rgba(15, 23, 42, 0.7)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "0.5rem", padding: "0.6rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#38bdf8" }}>
                  ⚡ Sincronia de Áudio (Offset A/V):
                </span>
                <input
                  type="number"
                  step="0.05"
                  value={audioOffset}
                  onChange={(e) => updateAudioOffset(Number(e.target.value) || 0)}
                  style={{ width: "70px", padding: "0.2rem 0.4rem", fontSize: "0.82rem", textAlign: "center" }}
                  className="admin-input"
                  title="Ajuste fino de atraso ou adiantamento do áudio em segundos"
                />
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>s</span>
              </div>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Ajustes rápidos:</span>
                {[-0.5, -0.2, 0, 0.2, 0.5, 0.72, 1.0, 1.5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`btn btn--xs ${audioOffset === val ? "btn--primary" : "btn--secondary"}`}
                    onClick={() => updateAudioOffset(val)}
                    style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem" }}
                  >
                    {val > 0 ? `+${val}s` : `${val}s`}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="admin-mini-clipper__time-display" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#38bdf8" }}>
                ⏱️ Posição Atual: {formatSeconds(currentTime)} / {formatSeconds(duration)}
              </div>
              {clipDuration > 0 && (
                <span style={{ fontSize: "0.82rem", color: "#fbbf24", fontWeight: 600 }}>
                  Duração do trecho: {clipDuration}s
                </span>
              )}
            </div>

            {/* Início e Fim inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", background: "rgba(15, 23, 42, 0.4)", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Início ({formatSeconds(clipStart)}):</label>
                  <button
                    type="button"
                    className="btn btn--secondary btn--xs"
                    onClick={handleMarkStart}
                    title="Definir início no tempo atual do vídeo"
                  >
                    ⏱️ Ponto Atual
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="admin-input"
                  value={clipStart}
                  onChange={(e) => setClipStart(Math.max(0, Number(e.target.value) || 0))}
                  style={{ fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Fim ({formatSeconds(clipEnd)}):</label>
                  <button
                    type="button"
                    className="btn btn--secondary btn--xs"
                    onClick={handleMarkEnd}
                    title="Definir fim no tempo atual do vídeo"
                  >
                    ⏱️ Ponto Atual
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="admin-input"
                  value={clipEnd}
                  onChange={(e) => setClipEnd(Math.max(0, Number(e.target.value) || 0))}
                  style={{ fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
                />
              </div>
            </div>

            {/* Actions for current snippet */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                onClick={handlePreviewClip}
                disabled={clipDuration <= 0}
                title="Tocar trecho selecionado de Início até Fim"
              >
                ▶️ Ouvir Prévia
              </button>
              <button
                type="button"
                className="btn btn--primary btn--xs"
                onClick={handleAddClip}
                disabled={clipDuration <= 0}
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
                  <div key={idx} className="admin-mini-clipper__clip-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <span>
                      <strong>#{idx + 1} {clip.sourceLabel}:</strong> {formatSeconds(clip.startSeconds)} até {formatSeconds(clip.startSeconds + clip.durationSeconds)} ({clip.durationSeconds}s) {clip.audioOffsetSeconds ? `[offset: ${clip.audioOffsetSeconds}s]` : ""}
                    </span>
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--xs"
                        onClick={() => handlePlayClipSnippet(clip)}
                        title="Ouvir no player"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--xs"
                        onClick={() => handleRemoveClip(idx)}
                        title="Remover trecho"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {errorMessage && (
                <div className="admin-alert admin-alert--danger" style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                  ⚠️ {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="admin-alert admin-alert--success" style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                  {successMessage}
                </div>
              )}

              <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleGenerateVoice}
                  disabled={isProcessing}
                >
                  {isProcessing ? "⏳ Processando com FFmpeg no servidor…" : `✨ Gerar Áudio Final (${clips.length} trecho${clips.length > 1 ? "s" : ""})`}
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
              Ou se já possuir o arquivo de áudio gravado no computador:
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
