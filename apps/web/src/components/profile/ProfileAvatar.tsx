import { useEffect, useState, type ReactNode } from 'react';

export function ProfileAvatar({
  name,
  avatar,
  className = '',
  children,
}: {
  name?: string | null;
  avatar?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const safeName = name?.trim() || 'Perfil';
  const initial = safeName.charAt(0).toLocaleUpperCase('pt-BR') || '?';
  const imageSource = typeof avatar === 'string' && avatar.startsWith('/') && !avatar.startsWith('//')
    ? avatar
    : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageSource]);

  return (
    <span className={`profile-avatar ${className}`.trim()}>
      {imageSource && !imageFailed ? (
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
