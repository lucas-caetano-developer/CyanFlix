import { useState } from "react";
import { ARCHETYPE_CATEGORIES } from "../../lib/characterConstants";

type Props = {
  selected: string[];
  onChange: (newSelected: string[]) => void;
};

export function CharacterArchetypeSelector({ selected, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const toggleArchetype = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((item) => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const removeArchetype = (opt: string) => {
    onChange(selected.filter((item) => item !== opt));
  };

  const addCustom = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
    setSearch("");
  };

  const q = search.toLowerCase();

  return (
    <div className="admin-archetype-selector" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Selected tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", minHeight: "36px", background: "rgba(10, 15, 25, 0.6)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.5rem", padding: "0.5rem" }}>
        {selected.length === 0 ? (
          <span style={{ fontSize: "0.8rem", color: "#64748b", alignSelf: "center", paddingLeft: "0.35rem" }}>
            Nenhum arquétipo selecionado. Clique nas opções abaixo para adicionar.
          </span>
        ) : (
          selected.map((item) => (
            <span
              key={item}
              className="admin-archetype-badge"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.6rem", fontSize: "0.78rem" }}
            >
              {item}
              <button
                type="button"
                onClick={() => removeArchetype(item)}
                style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, fontSize: "0.85rem", lineHeight: 1 }}
                title="Remover"
              >
                ✕
              </button>
            </span>
          ))
        )}
      </div>

      {/* Filter and custom add */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          className="admin-input"
          placeholder="Buscar arquétipo ou adicionar personalizado…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          style={{ fontSize: "0.85rem" }}
        />
        {search.trim() && !selected.includes(search.trim()) && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={addCustom}
            style={{ whiteSpace: "nowrap" }}
          >
            + Adicionar "{search.trim()}"
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn btn--xs ${activeCategory === "all" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => setActiveCategory("all")}
          style={{ fontSize: "0.72rem" }}
        >
          Todos
        </button>
        {ARCHETYPE_CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            type="button"
            className={`btn btn--xs ${activeCategory === cat.name ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveCategory(cat.name)}
            style={{ fontSize: "0.72rem" }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Options List */}
      <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.85rem", background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0.5rem", padding: "0.75rem" }}>
        {ARCHETYPE_CATEGORIES.map((cat) => {
          if (activeCategory !== "all" && activeCategory !== cat.name) return null;
          const filteredOptions = cat.options.filter((opt) => (q ? opt.toLowerCase().includes(q) : true));
          if (filteredOptions.length === 0) return null;

          return (
            <div key={cat.name}>
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", fontWeight: 700, marginBottom: "0.35rem" }}>
                {cat.name}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {filteredOptions.map((opt) => {
                  const isChecked = selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArchetype(opt)}
                      style={{
                        background: isChecked ? "rgba(245, 158, 11, 0.25)" : "rgba(255, 255, 255, 0.05)",
                        border: isChecked ? "1px solid #fbbf24" : "1px solid rgba(255, 255, 255, 0.1)",
                        color: isChecked ? "#fbbf24" : "#cbd5e1",
                        borderRadius: "9999px",
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.76rem",
                        cursor: "pointer",
                        fontWeight: isChecked ? 600 : 400,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isChecked ? `✓ ${opt}` : `+ ${opt}`}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
