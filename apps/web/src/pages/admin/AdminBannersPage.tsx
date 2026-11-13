import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PromoBanner, getDefaultCategoryTitles } from "../../components/admin/PromoBanner";
import { parseArchetypes } from "../../lib/characterConstants";
import type { Character, AdminCatalogWork } from "../../lib/types";

type RoleFilter = "all" | "protagonist" | "supporting" | "villain";

interface BannerCustomState {
  logoPosition: "left" | "right";
  customColor?: string;
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
    logoPosition?: "left" | "right";
    customColor?: string;
  } | null>(null);

  // Per-character custom override state (color, logoPosition)
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

  const updateCustomState = (charId: string, partial: Partial<BannerCustomState>) => {
    setCustomStates((prev) => {
      const existing = prev[charId] || {
        logoPosition: "right",
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

  const totalBannersCount = groupedWorks.reduce((acc, g) => acc + g.banners.length, 0);

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header-row" style={{ alignItems: "flex-start", marginBottom: "1.75rem" }}>
        <div>
          <span className="admin-page__eyebrow">Marketing & Identidade Visual</span>
          <h1 className="admin-page__title">Banners Promocionais de Personagens</h1>
          <p className="admin-page__desc" style={{ maxWidth: "750px", marginTop: "0.25rem" }}>
            Banners gerados automaticamente para protagonistas, coadjuvantes e antagonistas, com um banner exclusivo
            para cada arquétipo do personagem. Utiliza estritamente a foto de corpo e a logo oficial da obra.
          </p>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
          {groupedWorks.map((group) => (
            <section key={group.workId} className="admin-banners-work-group">
              {/* Group Title Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1.25rem",
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
              <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                {group.banners.map((b) => {
                  const state = customStates[b.character.id] || {
                    logoPosition: "right",
                  };
                  const activeColor = state.customColor || b.character.themeColor || "#0284C7";

                  return (
                    <div
                      key={b.id}
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
                        character={b.character}
                        work={group.work}
                        logoPosition={state.logoPosition}
                        categoryTitle={b.categoryTitle}
                        categorySubtitle={b.categorySubtitle}
                        customColor={activeColor}
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
                          gap: "0.75rem",
                          padding: "0.6rem 0.8rem",
                          background: "rgba(10, 14, 23, 0.6)",
                          borderRadius: "10px",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                        }}
                      >
                        {/* Left: Info & Color Swatch */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>
                            {b.character.name}
                          </span>
                          <span className="admin-role-badge">{b.categoryTitle}</span>
                          {b.archetype && (
                            <span
                              className="admin-archetype-badge"
                              style={{
                                background: `${activeColor}22`,
                                color: activeColor,
                                border: `1px solid ${activeColor}44`,
                              }}
                            >
                              Arquétipo: {b.archetype}
                            </span>
                          )}

                          {/* Color Picker */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Cor Tema:</span>
                            <input
                              type="color"
                              value={activeColor}
                              onChange={(e) => handleColorChange(b.character, e.target.value)}
                              style={{
                                width: "28px",
                                height: "24px",
                                padding: "0",
                                border: "1px solid #334155",
                                borderRadius: "4px",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              title="Alterar cor de tema do personagem"
                            />
                            <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                              {activeColor}
                            </span>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            onClick={() =>
                              updateCustomState(b.character.id, {
                                logoPosition: state.logoPosition === "right" ? "left" : "right",
                              })
                            }
                            title="Alternar posição do logotipo entre esquerda e direita"
                          >
                            Posição: {state.logoPosition === "right" ? "Direita" : "Esquerda"}
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
