import { useEffect, useState, type ReactNode } from "react";
import { findAvatar } from "./avatars";

export function ProfileAvatar({
  name,
  avatar,
  className = "",
  children,
}: {
  name?: string | null;
  avatar?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const safeName = name?.trim() || "Perfil";
  const initial = safeName.charAt(0).toLocaleUpperCase("pt-BR") || "?";
  const avatarDef = avatar ? findAvatar(String(avatar)) : undefined;
  const imageSource =
    typeof avatar === "string" && avatar.startsWith("/") && !avatar.startsWith("//")
      ? avatar
      : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageSource]);

  return (
    <span className={`profile-avatar ${className}`.trim()}>
      {avatarDef ? (
        <span className="profile-avatar__svg" dangerouslySetInnerHTML={{ __html: avatarDef.svg }} />
      ) : imageSource && !imageFailed ? (
        <img
          src={imageSource}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="profile-avatar__initial" aria-hidden="true">{initial}</span>
      )}
      {children}
    </span>
  );
}
