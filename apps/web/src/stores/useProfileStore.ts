import { create } from "zustand";

interface ProfileState {
  profileId: string | undefined;
  setProfile: (id: string) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profileId: localStorage.getItem("cyanflix.profile") ?? undefined,
  setProfile: (id) => { 
    localStorage.setItem("cyanflix.profile", id); 
    set({ profileId: id }); 
  },
  clearProfile: () => { 
    localStorage.removeItem("cyanflix.profile"); 
    set({ profileId: undefined }); 
  },
}));
