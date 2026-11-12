import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ProfileAvatar } from "./ProfileAvatar";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import type { AvatarGroup } from "../../lib/types";

export interface AvatarModalProps {
  isOpen: boolean;
  currentAvatar: string;
  onSave: (avatar: string) => void;
  onClose: () => void;
}

export function AvatarModal({ isOpen, currentAvatar, onSave, onClose }: AvatarModalProps) {
  const [selected, setSelected] = useState<string>(currentAvatar);
  const avatarQuery = useQuery<AvatarGroup[]>({
    queryKey: ["profile-avatars"],
    queryFn: api.getAvatarGroups,
    enabled: isOpen,
    staleTime: 60_000,
  });

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(selected);
    onClose();
  };

  const handleCancel = () => {
    setSelected(currentAvatar);
    onClose();
  };

  return (
    <div
      className="avatar-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className="avatar-modal__card">
        {/* Top Header */}
        <div className="avatar-modal__header">
          <div className="avatar-modal__preview-wrap">
            <ProfileAvatar avatar={selected} className="avatar-modal__preview-avatar" />
          </div>

          <div className="avatar-modal__header-content">
            <h2 id="avatar-modal-title" className="avatar-modal__title">Seleção de Avatar</h2>
            <p className="avatar-modal__subtitle">
              Escolha seu avatar! Você pode mudá-lo a qualquer momento.
            </p>
            <div className="avatar-modal__header-actions">
              <button
                type="button"
                className="avatar-modal__btn avatar-modal__btn--cancel"
                onClick={handleCancel}
              >
                CANCELAR
              </button>
              <button
                type="button"
                className="avatar-modal__btn avatar-modal__btn--save"
                onClick={handleSave}
              >
                SALVAR
              </button>
            </div>
          </div>

          <button
            type="button"
            className="avatar-modal__close-btn"
            onClick={handleCancel}
            aria-label="Fechar seleção de avatar"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Groups List */}
        <div className="avatar-modal__body">
          {avatarQuery.isLoading && (
            <div className="avatar-modal__loading">
              <Spinner />
              <span>Carregando avatares...</span>
            </div>
          )}

          {/* Obra / Work Groups */}
          {avatarQuery.data?.map((group) => (
            <AvatarRow
              key={group.id}
              title={group.title}
              items={group.characters.map((c) => ({
                id: c.id,
                value: c.photoUrl,
                name: c.name,
                photoUrl: c.photoUrl,
              }))}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface RowItem {
  id: string;
  value: string;
  name: string;
  photoUrl?: string;
  svg?: string;
  color?: string;
}

function AvatarRow({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: RowItem[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!railRef.current) return;
    const offset = direction === "left" ? -320 : 320;
    railRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  return (
    <div className="avatar-modal__group">
      <h3 className="avatar-modal__group-title">{title}</h3>
      <div className="avatar-modal__rail-wrapper">
        <button
          type="button"
          className="avatar-modal__nav-arrow avatar-modal__nav-arrow--left"
          onClick={() => scroll("left")}
          aria-label={`Rolar para a esquerda em ${title}`}
        >
          ‹
        </button>

        <div className="avatar-modal__rail" ref={railRef}>
          {items.map((item) => {
            const isSelected = selected === item.value;
            return (
              <button
                key={item.id}
                type="button"
                className={`avatar-modal__item${isSelected ? " avatar-modal__item--selected" : ""}`}
                onClick={() => onSelect(item.value)}
                title={item.name}
                aria-label={`Selecionar ${item.name}`}
                aria-pressed={isSelected}
              >
                {item.photoUrl ? (
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    className="avatar-modal__char-img"
                    loading="lazy"
                  />
                ) : item.svg ? (
                  <div
                    className="avatar-modal__char-svg"
                    style={{ backgroundColor: item.color }}
                    dangerouslySetInnerHTML={{ __html: item.svg }}
                  />
                ) : (
                  <ProfileAvatar name={item.name} avatar={item.value} />
                )}
                {isSelected && <span className="avatar-modal__item-check">✓</span>}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="avatar-modal__nav-arrow avatar-modal__nav-arrow--right"
          onClick={() => scroll("right")}
          aria-label={`Rolar para a direita em ${title}`}
        >
          ›
        </button>
      </div>
    </div>
  );
}
