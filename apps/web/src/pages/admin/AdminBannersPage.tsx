import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PromoBanner, getDefaultCategoryTitles } from "../../components/admin/PromoBanner";
import { parseArchetypes } from "../../lib/characterConstants";
import type { Character, AdminCatalogWork } from "../../lib/types";

type RoleFilter = "all" | "protagonist" | "supporting" | "villain";

const BANNER_STORAGE_KEY = "cyanflix.admin.banner_custom_states";

interface BannerCustomState {
  logoPosition: "left" | "right";
  customColor?: string;
  flipHorizontal?: boolean;
  characterOffsetX: number;
  characterOffsetY: number;
  characterScale: number;
  tagline?: string;
}

function loadSavedBannerStates(): Record<string, BannerCustomState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Erro ao carregar estados dos banners do localStorage:", err);
    return {};
  }
}

interface BannerItem {
  id: string;
  character: Character;
  archetype: string | null;
  categoryTitle: string;
  categorySubtitle: string;
}

function isEligibleBannerRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return r.includes("protag") || r.includes("coadj") || r.includes("apoio") || r.includes("antag") || r.includes("vil");
}

export function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<RoleFilter>("all");
  const [selectedWorkId, setSelectedWorkId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fullscreenBanner, setFullscreenBanner] = useState<{
    character: Character;
    work?: AdminCatalogWork | null;
    categoryTitle: string;
    categorySubtitle: string;
    tagline?: string;
    logoPosition?: "left" | "right";
    customColor?: string;
    flipHorizontal?: boolean;
    characterOffsetX?: number;
    characterOffsetY?: number;
    characterScale?: number;
  } | null>(null);

  // Custom override state (position, scale, color, logoPosition, flip) persisted in localStorage
  const [customStates, setCustomStates] = useState<Record<string, BannerCustomState>>(loadSavedBannerStates);

  // Synchronize banner modifications with localStorage so they persist across page changes and browser reloads
  useEffect(() => {
    try {
      localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(customStates));
    } catch (err) {
      console.error("Erro ao salvar estados dos banners no localStorage:", err);
    }
  }, [customStates]);

  // Fetch Catalog & Characters
  const { data: catalogData, isLoading: isLoadingCatalog } = useQuery({
    queryKey: ["admin", "catalog"],
    queryFn: () => api.getAdminCatalog(),
  });

  const { data: characters = [], isLoading: isLoadingCharacters } = useQuery({
    queryKey: ["admin", "characters"],
    queryFn: () => api.getAdminCharacters(),
  });

  const works = catalogData?.items || [];
  const worksMap = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);

  // Mutation to persist color updates to character
  const updateCharacterColorMutation = useMutation({
    mutationFn: ({ id, themeColor }: { id: string; themeColor: string }) =>
      api.updateAdminCharacter(id, { themeColor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "characters"] });
    },
  });

  // Group banners by Work (only Protagonistas, Coadjuvantes, Antagonistas; 1 banner per archetype)
  const groupedWorks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const map = new Map<string, { work: AdminCatalogWork | null; banners: BannerItem[] }>();

    for (const char of characters) {
      // Rule 1: Only Protagonistas, Coadjuvantes, Antagonistas
      if (!isEligibleBannerRole(char.role)) continue;

      const roleLower = (char.role || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (selectedRole === "villain" && !roleLower.includes("vil") && !roleLower.includes("antag")) continue;
      if (selectedRole === "protagonist" && !roleLower.includes("protag")) continue;
      if (selectedRole === "supporting" && !roleLower.includes("coadj") && !roleLower.includes("apoio")) continue;

      // Search query filter
      if (q && !char.name.toLowerCase().includes(q)) {
        const matchesWork = char.works?.some((w) => w.title.toLowerCase().includes(q)) || char.work?.title.toLowerCase().includes(q);
        if (!matchesWork) continue;
      }

      // Rule 2: 1 banner per archetype
      const archetypes = parseArchetypes(char.archetype);
      const bannerArchetypes = archetypes.length > 0 ? archetypes : [null];

      const charWorks = char.works && char.works.length > 0
        ? char.works
        : char.workId
        ? [{ id: char.workId, title: char.work?.title || "Obra Desconhecida", contentKind: "series" as const }]
        : [{ id: "unassigned", title: "CyanFlix Originals", contentKind: "series" as const }];

      for (const w of charWorks) {
        if (selectedWorkId !== "all" && w.id !== selectedWorkId) continue;

        let entry = map.get(w.id);
        if (!entry) {
          const fullWork = worksMap.get(w.id) || null;
          entry = { work: fullWork, banners: [] };
          map.set(w.id, entry);
        }

        for (let i = 0; i < bannerArchetypes.length; i++) {
          const arch = bannerArchetypes[i];
          const titles = getDefaultCategoryTitles(char.role, arch);
          const bannerId = `${char.id}-${w.id}-${i}-${arch ? arch.toLowerCase().replace(/\s+/g, "-") : "base"}`;

          if (!entry.banners.some((b) => b.id === bannerId)) {
            entry.banners.push({
              id: bannerId,
              character: char,
              archetype: arch,
              categoryTitle: titles.title,
              categorySubtitle: titles.subtitle,
            });
          }
        }
      }
    }

    return Array.from(map.entries())
      .filter(([_, data]) => data.banners.length > 0)
      .map(([workId, data]) => {
        const matchedWork = data.work || worksMap.get(workId) || null;
        return {
          workId,
          work: matchedWork,
          title: matchedWork?.title || data.banners[0]?.character.works?.[0]?.title || "CyanFlix",
          banners: data.banners,
        };
      });
  }, [characters, worksMap, selectedRole, selectedWorkId, searchQuery]);

  const getBannerState = (bannerId: string, charId?: string): BannerCustomState => {
    return (
      customStates[bannerId] ||
      (charId ? customStates[charId] : undefined) || {
        logoPosition: "right",
        characterOffsetX: 0,
        characterOffsetY: 0,
        characterScale: 1.25,
      }
    );
  };

  const updateBannerState = (
    bannerId: string,
    partial: Partial<BannerCustomState>,
    charId?: string
  ) => {
    setCustomStates((prev) => {
      const existing =
        prev[bannerId] ||
        (charId ? prev[charId] : undefined) || {
          logoPosition: "right",
          characterOffsetX: 0,
          characterOffsetY: 0,
          characterScale: 1.25,
        };
      const updated = { ...existing, ...partial };
      const next = { ...prev, [bannerId]: updated };
      if (charId) {
        const charExisting = prev[charId] || {
          logoPosition: "right",
          characterOffsetX: 0,
          characterOffsetY: 0,
          characterScale: 1.25,
        };
        next[charId] = { ...charExisting, ...partial };
      }
      return next;
    });
  };

  const handleColorChange = (bannerId: string, char: Character, newColor: string) => {
    updateBannerState(bannerId, { customColor: newColor }, char.id);
    updateCharacterColorMutation.mutate({ id: char.id, themeColor: newColor });
  };

  // Step adjust helpers
  const adjustOffsetX = (bannerId: string, delta: number, charId?: string) => {
    const cur = getBannerState(bannerId, charId);
    updateBannerState(bannerId, { characterOffsetX: cur.characterOffsetX + delta }, charId);
  };

  const adjustOffsetY = (bannerId: string, delta: number, charId?: string) => {
    const cur = getBannerState(bannerId, charId);
    updateBannerState(bannerId, { characterOffsetY: cur.characterOffsetY + delta }, charId);
  };

  const adjustScale = (bannerId: string, delta: number, charId?: string) => {
    const cur = getBannerState(bannerId, charId);
    const nextScale = Math.max(0.6, Math.min(2.5, Number((cur.characterScale + delta).toFixed(2))));
    updateBannerState(bannerId, { characterScale: nextScale }, charId);
  };

  const resetPosition = (bannerId: string, charId?: string) => {
    updateBannerState(
      bannerId,
      {
        characterOffsetX: 0,
        characterOffsetY: 0,
        characterScale: 1.25,
        flipHorizontal: undefined,
      },
      charId
    );
  };

  const resetAllBannerStates = () => {
    if (window.confirm("Deseja restaurar a posição e personalizações originais de todos os banners?")) {
      setCustomStates({});
      try {
        localStorage.removeItem(BANNER_STORAGE_KEY);
      } catch (err) {
        console.error("Erro ao limpar localStorage dos banners:", err);
      }
    }
  };

  const totalBannersCount = groupedWorks.reduce((acc, g) => acc + g.banners.length, 0);

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header-row" style={{ alignItems: "flex-start", marginBottom: "1.75rem", justifyContent: "space-between" }}>
        <div>
          <span className="admin-page__eyebrow">Marketing & Identidade Visual</span>
          <h1 className="admin-page__title">Banners Promocionais de Personagens</h1>
          <p className="admin-page__desc" style={{ maxWidth: "750px", marginTop: "0.25rem" }}>
            Banners gerados automaticamente para protagonistas, coadjuvantes e antagonistas, com um banner exclusivo
            para cada arquétipo. Fundo imersivo com a cor tema e degradê com preto no topo, tipografia ultra-condensada,
            recortes ampliados com espelhamento inteligente e controle de posição, logo oficial centralizada com o botão branco.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "#10b981", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            ✓ Posições salvas automaticamente
          </span>
          {Object.keys(customStates).length > 0 && (
            <button
              type="button"
              className="btn btn--secondary btn--xs"
              onClick={resetAllBannerStates}
              title="Redefinir todas as alterações e posições para o padrão"
            >
              ↺ Redefinir Todos
            </button>
          )}
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div
        className="admin-card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "2rem",
          padding: "1rem 1.25rem",
        }}
      >
        {/* Left: Role Pill Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#94a3b8", marginRight: "0.25rem" }}>
            Filtrar Papel:
          </span>
          <button
            type="button"
            className={`btn btn--sm ${selectedRole === "all" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setSelectedRole("all")}
          >
            Todos ({totalBannersCount})
          </button>
          <button
            type="button"
            className={`btn btn--sm ${selectedRole === "protagonist" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setSelectedRole("protagonist")}
          >
            Protagonistas
          </button>
          <button
            type="button"
            className={`btn btn--sm ${selectedRole === "supporting" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setSelectedRole("supporting")}
          >
            Coadjuvantes
          </button>
          <button
            type="button"
            className={`btn btn--sm ${selectedRole === "villain" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setSelectedRole("villain")}
          >
            Antagonistas
          </button>
        </div>

        {/* Right: Obra Selector & Search Input */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
          <select
            className="admin-select"
            value={selectedWorkId}
            onChange={(e) => setSelectedWorkId(e.target.value)}
            style={{ width: "auto", minWidth: "180px", height: "38px" }}
          >
            <option value="all">Todas as Obras ({works.length})</option>
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>

          <input
            type="search"
            placeholder="Buscar personagem ou obra..."
            className="admin-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "240px", height: "38px" }}
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoadingCatalog || isLoadingCharacters ? (
        <div className="admin-card" style={{ textAlign: "center", padding: "3rem" }}>
          <span style={{ color: "#94a3b8" }}>Carregando dados dos personagens e obras...</span>
        </div>
      ) : groupedWorks.length === 0 ? (
        <div
          className="admin-card"
          style={{
            textAlign: "center",
            padding: "4rem 2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "2.5rem" }}>🎨</span>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "1.2rem" }}>Nenhum banner elegível encontrado</h3>
          <p style={{ margin: 0, color: "#94a3b8", maxWidth: "500px", fontSize: "0.9rem" }}>
            Apenas personagens com papel de Protagonista, Coadjuvante ou Antagonista geram banners promocionais.
            Verifique os filtros selecionados ou cadastre novos personagens.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
          {groupedWorks.map((group) => (
            <section key={group.workId} className="admin-banners-work-group">
              {/* Group Title Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1.5rem",
                  paddingBottom: "0.75rem",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#fff" }}>
                    {group.title}
                  </h2>
                  <span
                    style={{
                      background: "rgba(0, 212, 255, 0.12)",
                      color: "#00d4ff",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                      border: "1px solid rgba(0, 212, 255, 0.25)",
                    }}
                  >
                    {group.banners.length} {group.banners.length === 1 ? "Banner" : "Banners"}
                  </span>
                </div>

                {group.work && (
                  <Link
                    to={`/admin/characters/work/${group.work.id}`}
                    className="btn btn--secondary btn--xs"
                  >
                    Gerenciar Personagens da Obra →
                  </Link>
                )}
              </div>

              {/* Banners List for this Work */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2.75rem" }}>
                {group.banners.map((b) => {
                  const state = getBannerState(b.id, b.character.id);
                  const activeColor = state.customColor || b.character.themeColor || "#2b1854";
                  const isFlipped =
                    state.flipHorizontal !== undefined
                      ? state.flipHorizontal
                      : state.logoPosition === "left";

                  return (
                    <div
                      key={b.id}
                      style={{
                        background: "rgba(15, 23, 42, 0.55)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "18px",
                        padding: "1.4rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "1.1rem",
                      }}
                    >
                      {/* Live Banner Canvas */}
                      <PromoBanner
                        character={b.character}
                        work={group.work}
                        logoPosition={state.logoPosition}
                        categoryTitle={b.categoryTitle}
                        categorySubtitle={b.categorySubtitle}
                        customColor={activeColor}
                        flipHorizontal={state.flipHorizontal}
                        characterOffsetX={state.characterOffsetX}
                        characterOffsetY={state.characterOffsetY}
                        characterScale={state.characterScale}
                        onClickCta={() => {
                          alert(`Ação do botão 'ASSISTA JÁ' para ${b.character.name} em ${group.title}!`);
                        }}
                      />

                      {/* Banner Customization Toolbar */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.85rem",
                          padding: "0.75rem 1rem",
                          background: "rgba(10, 14, 23, 0.75)",
                          borderRadius: "12px",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                        }}
                      >
                        {/* Left: Info, Role badge, Archetype badge & Color */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 800, color: "#fff", fontSize: "0.95rem" }}>
                            {b.character.name}
                          </span>
                          <span className="admin-role-badge">{b.categoryTitle}</span>
                          {b.archetype && (
                            <span
                              className="admin-archetype-badge"
                              style={{
                                background: `${activeColor}28`,
                                color: "#ffffff",
                                border: `1px solid ${activeColor}55`,
                              }}
                            >
                              Arquétipo: {b.archetype}
                            </span>
                          )}

                          {/* Color Picker */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "0.25rem" }}>
                            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Cor Fundo/Tema:</span>
                            <input
                              type="color"
                              value={activeColor}
                              onChange={(e) => handleColorChange(b.id, b.character, e.target.value)}
                              style={{
                                width: "30px",
                                height: "26px",
                                padding: "0",
                                border: "1px solid #475569",
                                borderRadius: "4px",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              title="Alterar cor de tema/fundo do personagem"
                            />
                            <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                              {activeColor}
                            </span>
                          </div>
                        </div>

                        {/* Center: Position Controls (Cima, Baixo, Esquerda, Direita, Escala) */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            background: "rgba(0, 0, 0, 0.35)",
                            padding: "4px 8px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.05)",
                          }}
                        >
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, marginRight: "4px" }}>
                            Posição Recorte:
                          </span>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => adjustOffsetX(b.id, -10, b.character.id)}
                            title="Mover para esquerda (X -10)"
                            style={{ minWidth: "26px", padding: "2px 6px" }}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => adjustOffsetX(b.id, 10, b.character.id)}
                            title="Mover para direita (X +10)"
                            style={{ minWidth: "26px", padding: "2px 6px" }}
                          >
                            →
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => adjustOffsetY(b.id, -10, b.character.id)}
                            title="Mover para cima (Y -10)"
                            style={{ minWidth: "26px", padding: "2px 6px" }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => adjustOffsetY(b.id, 10, b.character.id)}
                            title="Mover para baixo (Y +10)"
                            style={{ minWidth: "26px", padding: "2px 6px" }}
                          >
                            ↓
                          </button>
                          <span style={{ fontSize: "0.72rem", color: "#64748b", margin: "0 2px" }}>|</span>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => adjustScale(b.id, 0.05, b.character.id)}
                            title="Aumentar tamanho do personagem (+5%)"
                            style={{ minWidth: "26px", padding: "2px 6px" }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => adjustScale(b.id, -0.05, b.character.id)}
                            title="Diminuir tamanho do personagem (-5%)"
                            style={{ minWidth: "26px", padding: "2px 6px" }}
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => resetPosition(b.id, b.character.id)}
                            title="Restaurar posição original"
                            style={{ padding: "2px 6px", fontSize: "0.7rem" }}
                          >
                            ↺ Reset
                          </button>
                          <span style={{ fontSize: "0.72rem", color: "#00d4ff", marginLeft: "4px", fontFamily: "monospace" }}>
                            X:{state.characterOffsetX} Y:{state.characterOffsetY} Z:{Math.round(state.characterScale * 100)}%
                          </span>
                        </div>

                        {/* Right: Flip/Virar, Logo Position & Fullscreen */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className={`btn btn--xs ${isFlipped ? "btn--primary" : "btn--secondary"}`}
                            onClick={() =>
                              updateBannerState(b.id, {
                                flipHorizontal: !isFlipped,
                              }, b.character.id)
                            }
                            title="Virar/inverter orientação do personagem horizontalmente"
                          >
                            Virar: {isFlipped ? "Sim" : "Não"}
                          </button>

                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() => {
                              const nextLogo = state.logoPosition === "right" ? "left" : "right";
                              updateBannerState(b.id, {
                                logoPosition: nextLogo,
                                flipHorizontal: nextLogo === "left",
                              }, b.character.id);
                            }}
                            title="Alternar posição do logotipo entre esquerda e direita (com virada automática do personagem)"
                          >
                            Logo: {state.logoPosition === "right" ? "Direita" : "Esquerda"}
                          </button>

                          <button
                            type="button"
                            className="btn btn--primary btn--xs"
                            onClick={() =>
                              setFullscreenBanner({
                                character: b.character,
                                work: group.work,
                                categoryTitle: b.categoryTitle,
                                categorySubtitle: b.categorySubtitle,
                                logoPosition: state.logoPosition,
                                customColor: activeColor,
                                flipHorizontal: isFlipped,
                                characterOffsetX: state.characterOffsetX,
                                characterOffsetY: state.characterOffsetY,
                                characterScale: state.characterScale,
                              })
                            }
                          >
                            Ver em Tela Cheia ⤢
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Fullscreen Preview Modal */}
      {fullscreenBanner && (
        <div
          className="admin-modal-overlay"
          onClick={() => setFullscreenBanner(null)}
          style={{ padding: "2rem" }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1280px",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              background: "#0b0f19",
              padding: "1.5rem",
              borderRadius: "18px",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#fff", fontSize: "1.2rem" }}>
                  Prévia do Banner: {fullscreenBanner.character.name} — {fullscreenBanner.categoryTitle}
                  {fullscreenBanner.categorySubtitle ? ` + ${fullscreenBanner.categorySubtitle}` : ""}
                </h3>
                <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                  Visualização de alta resolução em proporção widescreen 3.2:1
                </span>
              </div>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setFullscreenBanner(null)}
              >
                ✕
              </button>
            </div>

            <PromoBanner
              character={fullscreenBanner.character}
              work={fullscreenBanner.work}
              logoPosition={fullscreenBanner.logoPosition}
              categoryTitle={fullscreenBanner.categoryTitle}
              categorySubtitle={fullscreenBanner.categorySubtitle}
              customColor={fullscreenBanner.customColor}
              flipHorizontal={fullscreenBanner.flipHorizontal}
              characterOffsetX={fullscreenBanner.characterOffsetX}
              characterOffsetY={fullscreenBanner.characterOffsetY}
              characterScale={fullscreenBanner.characterScale}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setFullscreenBanner(null)}
              >
                Fechar Prévia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
