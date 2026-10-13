import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useProfileStore } from "../stores/useProfileStore";
import { Spinner } from "../components/ui/Spinner";
import { Profile } from "../lib/types";

export function ProfilesPage() {
  const navigate = useNavigate();
  const setProfile = useProfileStore((s) => s.setProfile);
  
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: api.getProfiles,
  });

  if (isLoading) {
    return <Spinner fullScreen />;
  }

  const handleProfileClick = (profile: Profile) => {
    setProfile(profile.id);
    if (profile.role === "admin") {
      navigate("/admin");
    } else {
      navigate("/browse");
    }
  };

  return (
    <div className="profiles-page">
      <div className="profiles-page__logo">CyanFlix</div>
      <h1 className="profiles-page__heading">Quem está assistindo?</h1>
      <p className="profiles-page__subheading">Selecione seu perfil para continuar</p>
      
      <div className="profiles-page__grid">
        {profiles?.map((profile: Profile) => (
          <div 
            key={profile.id} 
            className="profile-card"
            onClick={() => handleProfileClick(profile)}
            role="button"
            tabIndex={0}
          >
            <div className={`profile-card__avatar ${profile.role === 'admin' ? 'profile-card__avatar--admin' : 'profile-card__avatar--viewer'}`}>
              <div className="profile-card__avatar-inner">
                {profile.role === "admin" ? "⚙" : "▶"}
              </div>
            </div>
            <div className="profile-card__name">{profile.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
