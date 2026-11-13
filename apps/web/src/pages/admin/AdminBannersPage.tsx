import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PromoBanner, getDefaultCategoryTitles } from "../../components/admin/PromoBanner";
import type { Character, Work } from "../../lib/types";

type RoleFilter = "all" | "protagonist" | "supporting" | "villain";

interface BannerCustomState {
  logoPosition: "left" | "right";
  categoryTitle?: string;
  categorySubtitle?: string;
  customColor?: string;
  preferredPhoto: "body" | "avatar";
}

export function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<RoleFilter>("all");
  const [selectedWorkId, setSelectedWorkId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fullscreenBanner, setFullscreenBanner] = useState<{
    character: Character;
    work?: Work | null;
    customState?: BannerCustomState;
  } | null>(null);

  // Per-character custom override state
  const [customStates, setCustomStates] = useState<Record<string, BannerCustomState>>({});

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

  // Group characters by Work
  const groupedWorks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    // Map workId -> list of characters
    const map = new Map<string, { work: Work | null; characters: Character[] }>();

    for (const char of characters) {
      // Role filter
      if (selectedRole !== "all") {
        const role = (char.role || "").toLowerCase();
        if (selectedRole === "villain" && !role.includes("vil") && !role.includes("antag")) continue;
        if (selectedRole === "protagonist" && !role.includes("protag")) continue;
        if (selectedRole === "supporting" && !role.includes("coadj") && !role.includes("apoio") && !role.includes("secund") && !role.includes("recorr") && !role.includes("deuterag") && !role.includes("tritag")) continue;
      }

      // Search query filter
      if (q && !char.name.toLowerCase().includes(q)) {
        const matchesWork = char.works?.some((w) => w.title.toLowerCase().includes(q)) || char.work?.title.toLowerCase().includes(q);
        if (!matchesWork) continue;
      }

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
          entry = { work: fullWork, characters: [] };
          map.set(w.id, entry);
        }
        if (!entry.characters.some((c) => c.id === char.id)) {
          entry.characters.push(char);
        }
      }
    }

    return Array.from(map.entries())
      .filter(([_, data]) => data.characters.length > 0)
      .map(([workId, data]) => ({
        workId,
        work: data.work || (data.characters[0]?.works?.[0] ? worksMap.get(data.characters[0].works[0].id) : null) || null,
        title: data.work?.title || data.characters[0]?.works?.[0]?.title || "CyanFlix",
        characters: data.characters,
      }));
  }, [characters, worksMap, selectedRole, selectedWorkId, searchQuery]);

  const updateCustomState = (charId: string, partial: Partial<BannerCustomState>) => {
    setCustomStates((prev) => {
      const existing = prev[charId] || {
        logoPosition: "right",
        preferredPhoto: "body",
      };
      return {
        ...prev,
        [charId]: {
          ...existing,
          ...partial,
        },
      };
    });
  };

  const handleColorChange = (char: Character, newColor: string) => {
    updateCustomState(char.id, { customColor: newColor });
    updateCharacterColorMutation.mutate({ id: char.id, themeColor: newColor });
  };

  const totalBannersCount = groupedWorks.reduce((acc, g) => acc + g.characters.length, 0);

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header-row" style={{ alignItems: "flex-start", marginBottom: "1.75rem" }}>
        <div>
          <span className="admin-page__eyebrow">Marketing & Identidade Visual</span>
          <h1 className="admin-page__title">Banners Promocionais de Personagens</h1>
          <p className="admin-page__desc" style={{ maxWidth: "750px", marginTop: "0.25rem" }}>
            Banners compostos automaticamente com tipografia impactante, recortes dos personagens e logos das obras.
            Inspirados no padrão estético da Crunchyroll e Netflix, divididos por obra e categorizados por função narrativa.
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div
        className="admin-card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
          padding: "1rem 1.25rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* Work Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>Obra:</span>
            <select
              className="admin-select"
              value={selectedWorkId}
              onChange={(e) => setSelectedWorkId(e.target.value)}
              style={{ minWidth: "180px" }}
            >
              <option value="all">Todas as Obras ({works.length})</option>
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter Tabs */}
          <div style={{ display: "flex", gap: "4px", background: "rgba(15, 23, 42, 0.6)", padding: "4px", borderRadius: "8px" }}>
            {(
              [
                { id: "all", label: "Todos os Papéis" },
                { id: "protagonist", label: "Protagonistas" },
                { id: "supporting", label: "Coadjuvantes" },
                { id: "villain", label: "Vilões" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn btn--xs ${selectedRole === tab.id ? "btn--primary" : "btn--secondary"}`}
                onClick={() => setSelectedRole(tab.id)}
                style={{
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontWeight: selectedRole === tab.id ? 700 : 500,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="search"
            className="admin-input"
            placeholder="Buscar personagem..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "220px" }}
          />
          <span style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}>
            {totalBannersCount} banners
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoadingCatalog || isLoadingCharacters ? (
        <div className="admin-voice-actors__loading">
          <p>Montando e renderizando banners das obras…</p>
        </div>
      ) : groupedWorks.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state__icon">🎨</div>
          <h3>Nenhum banner gerado com os filtros atuais</h3>
          <p>Tente selecionar outra obra ou remover os filtros de busca e papel de personagem.</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setSelectedRole("all");
              setSelectedWorkId("all");
              setSearchQuery("");
            }}
          >
            Limpar Filtros
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
          {groupedWorks.map((group) => (
            <section key={group.workId} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Work Section Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingBottom: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
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
                    {group.characters.length} {group.characters.length === 1 ? "Banner" : "Banners"}
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
              <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                {group.characters.map((char) => {
                  const state = customStates[char.id] || {
                    logoPosition: "right",
                    preferredPhoto: "body",
                  };
                  const activeColor = state.customColor || char.themeColor || "#0284C7";
                  const defaultTitles = getDefaultCategoryTitles(char.role);

                  return (
                    <div
                      key={char.id}
                      style={{
                        background: "rgba(15, 23, 42, 0.45)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        borderRadius: "18px",
                        padding: "1.25rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      {/* Live Banner Canvas */}
                      <PromoBanner
                        character={char}
                        work={group.work}
                        logoPosition={state.logoPosition}
                        categoryTitle={state.categoryTitle}
                        categorySubtitle={state.categorySubtitle}
                        customColor={activeColor}
                        preferredPhoto={state.preferredPhoto}
                        onClickCta={() => {
                          alert(`Ação do botão 'ASSISTA JÁ' para ${char.name} em ${group.title}!`);
                        }}
                      />

                      {/* Banner Customization Toolbar */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          padding: "0.6rem 0.8rem",
                          background: "rgba(10, 14, 23, 0.6)",
                          borderRadius: "10px",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                        }}
                      >
                        {/* Left: Info & Color Swatch */}
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>
                            {char.name}
                          </span>
                          <span className="admin-role-badge">{char.role || "Personagem"}</span>

                          {/* Color Picker */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Cor Tema:</span>
                            <input
                              type="color"
                              value={activeColor}
                              onChange={(e) => handleColorChange(char, e.target.value)}
                              style={{
                                width: "28px",
                                height: "24px",
                                padding: "0",
                                border: "1px solid #334155",
                                borderRadius: "4px",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              title="Alterar cor de tema do banner"
                            />
                            <span style={{ fontSize: "0.78rem", color: "#cbd5e1", fontFamily: "monospace" }}>
                              {activeColor.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Middle: Layout & Titles Controls */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                          {/* Logo Position Switch */}
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Logo:</span>
                            <button
                              type="button"
                              className={`btn btn--xs ${state.logoPosition === "left" ? "btn--primary" : "btn--secondary"}`}
                              onClick={() => updateCustomState(char.id, { logoPosition: "left" })}
                            >
                              Esquerda
                            </button>
                            <button
                              type="button"
                              className={`btn btn--xs ${state.logoPosition === "right" ? "btn--primary" : "btn--secondary"}`}
                              onClick={() => updateCustomState(char.id, { logoPosition: "right" })}
                            >
                              Direita
                            </button>
                          </div>

                          {/* Image source toggle */}
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Foto:</span>
                            <button
                              type="button"
                              className={`btn btn--xs ${state.preferredPhoto === "body" ? "btn--primary" : "btn--secondary"}`}
                              onClick={() => updateCustomState(char.id, { preferredPhoto: "body" })}
                              title={char.bodyPhotoUrl ? "Usando foto de corpo" : "Sem foto de corpo cadastrada"}
                            >
                              Corpo
                            </button>
                            <button
                              type="button"
                              className={`btn btn--xs ${state.preferredPhoto === "avatar" ? "btn--primary" : "btn--secondary"}`}
                              onClick={() => updateCustomState(char.id, { preferredPhoto: "avatar" })}
                              title="Usando foto de avatar/perfil"
                            >
                              Avatar
                            </button>
                          </div>

                          {/* Category Title Presets */}
                          <select
                            className="admin-select"
                            style={{ fontSize: "0.75rem", padding: "4px 8px", height: "28px" }}
                            value={`${state.categoryTitle || defaultTitles.title}|${state.categorySubtitle || defaultTitles.subtitle}`}
                            onChange={(e) => {
                              const [t, s] = e.target.value.split("|");
                              updateCustomState(char.id, { categoryTitle: t, categorySubtitle: s });
                            }}
                          >
                            <option value="VILÕES|ICÔNICOS">Vilões Icônicos</option>
                            <option value="PROTAGONISTAS|LENDÁRIOS">Protagonistas Lendários</option>
                            <option value="COADJUVANTES|MARCANTES">Coadjuvantes Marcantes</option>
                            <option value="DESTAQUE|ESPECIAL">Destaque Especial</option>
                            <option value="PERSONAGENS|EM ALTA">Personagens em Alta</option>
                          </select>
                        </div>

                        {/* Right: Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() =>
                              setFullscreenBanner({
                                character: char,
                                work: group.work,
                                customState: state,
                              })
                            }
                          >
                            🔍 Tela Cheia
                          </button>
                          <Link
                            to={`/admin/characters/${char.id}`}
                            className="btn btn--secondary btn--xs"
                          >
                            ✏️ Editar Personagem
                          </Link>
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
                  Prévia do Banner: {fullscreenBanner.character.name}
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
              logoPosition={fullscreenBanner.customState?.logoPosition}
              categoryTitle={fullscreenBanner.customState?.categoryTitle}
              categorySubtitle={fullscreenBanner.customState?.categorySubtitle}
              customColor={fullscreenBanner.customState?.customColor}
              preferredPhoto={fullscreenBanner.customState?.preferredPhoto}
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
