import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { GameStateResponse } from "../utils/types";

export function useGameState({
  id,
  cameraMode,
}: {
  id: string | undefined;
  cameraMode: boolean;
}) {
  const gameStateKey = ["gameState", id] as const;

  const query = useQuery<GameStateResponse>({
    queryKey: gameStateKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/games/${id}/state`);
      return res.json();
    },
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data as GameStateResponse | undefined;
      const isActive = data?.game?.status === "active";
      return !!id && isActive && cameraMode ? 1000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 900,
  });

  return { ...query, gameStateKey };
}
