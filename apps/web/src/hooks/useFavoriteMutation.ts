import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Work } from '../lib/types';

export type FavoriteMutationVariables = {
  work: Work;
  nextFavorite: boolean;
};

export function useFavoriteMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ work, nextFavorite }: FavoriteMutationVariables) => {
      if (!profileId) throw new Error('Perfil indisponível');
      if (nextFavorite) await api.addFavorite(profileId, work.id);
      else await api.removeFavorite(profileId, work.id);
    },
    onMutate: async ({ work, nextFavorite }: FavoriteMutationVariables) => {
      if (!profileId) return { previous: undefined };

      const queryKey = ['favorites', profileId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Work[]>(queryKey);

      if (previous) {
        queryClient.setQueryData<Work[]>(queryKey, nextFavorite
          ? [work, ...previous.filter((item) => item.id !== work.id)]
          : previous.filter((item) => item.id !== work.id));
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (!profileId || !context?.previous) return;
      queryClient.setQueryData(['favorites', profileId], context.previous);
    },
    onSettled: () => {
      if (profileId) {
        void queryClient.invalidateQueries({ queryKey: ['favorites', profileId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
