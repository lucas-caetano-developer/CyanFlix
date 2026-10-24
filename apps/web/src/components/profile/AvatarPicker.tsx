import { useState } from "react";
import { AVATARS, type Avatar } from "./avatars";

export interface AvatarPickerProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function AvatarPicker({ value, onChange, className }: AvatarPickerProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="premium__avatar-picker" aria-label="Escolha o avatar do perfil">
      {AVATARS.map((avatar) => {
        const selected = avatar.id === value;
        return (
          <button
            key={avatar.id}
            type="button"
            className={`premium__avatar-item${selected ? " premium__avatar-item--selected" : ""}${hovered === avatar.id ? " premium__avatar-item--hovered" : ""}`}
            aria-label={avatar.label}
            aria-pressed={selected}
            onMouseEnter={() => setHovered(avatar.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(avatar.id)}
          >
            <span className="premium__avatar-badge">{avatar.label.charAt(0).toUpperCase()}</span>
            <div
              className="premium__avatar-preview"
              style={{ backgroundColor: avatar.color }}
              dangerouslySetInnerHTML={{ __html: avatar.svg }}
            />
            <span className="premium__avatar-name">{avatar.label}</span>
            {selected && <span className="premium__avatar-check">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
