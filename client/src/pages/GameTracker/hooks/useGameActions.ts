import { useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Profile } from "@shared/schema";
import bustSoundUrl from "@assets/Audio_01_15_2026_16_10_03_Sheldon_(mp3cut.net)_1768513329100.mp3";
import type { ActionMode, DartMultiplier, DartSegment, GameStateResponse } from "../utils/types";
import type { PopupType } from "@/components/ResultPopup";

export type PopupState = {
  type: PopupType;
  player: Profile | null;
  message: string;
};

export function useGameActions({
  id,
  gameStateKey,
  toast,
  gameState,
  resetSelection,
  showPopup,
  setActionMode,
}: {
  id: string | undefined;
  gameStateKey: readonly ["gameState", string | undefined];
  toast: (args: { title: string; description?: string; variant?: "destructive" }) => void;
  gameState: GameStateResponse | undefined;
  resetSelection: () => void;
  showPopup: (type: PopupType, player: Profile | null, message: string) => void;
  setActionMode: (mode: ActionMode) => void;
}) {
  const bustSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bustSoundRef.current = new Audio(bustSoundUrl);
  }, []);

  const invalidateGameState = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: gameStateKey });
  }, [id, gameStateKey]);

  const throwDartMutation = useMutation({
    mutationFn: async (data: { segment: number; multiplier: string; action: string }) => {
      const res = await apiRequest("POST", `/api/games/${id}/action`, data);
      return res.json() as Promise<{
        touchdown?: boolean;
        bust?: boolean;
        interception?: boolean;
        safety?: boolean;
        fgMade?: boolean;
        fgMissed?: boolean;
        patMade?: boolean;
        patMissed?: boolean;
        twoPointMade?: boolean;
        twoPointMissed?: boolean;
        turnover?: boolean;
      }>;
    },
    onSuccess: async (data) => {
      await invalidateGameState();
      resetSelection();

      if (!gameState) return;
      const currentPlayer = gameState.game.possession === 1 ? gameState.player1 : gameState.player2;

      if (data.touchdown) showPopup("celebration", currentPlayer, "TOUCHDOWN!");
      else if (data.bust) {
        if (bustSoundRef.current) {
          bustSoundRef.current.currentTime = 0;
          bustSoundRef.current.play().catch(() => {});
        }
        showPopup("sad", currentPlayer, "BUST!");
      } else if (data.interception) showPopup("sad", currentPlayer, "INTERCEPTION!");
      else if (data.safety) showPopup("sad", currentPlayer, "SAFETY!");
      else if (data.fgMade) showPopup("celebration", currentPlayer, "FIELD GOAL!");
      else if (data.fgMissed) showPopup("sad", currentPlayer, "MISSED FG!");
      else if (data.patMade) showPopup("celebration", currentPlayer, "PAT GOOD!");
      else if (data.patMissed) showPopup("sad", currentPlayer, "PAT MISSED!");
      else if (data.twoPointMade) showPopup("celebration", currentPlayer, "2-POINT CONVERSION!");
      else if (data.twoPointMissed) showPopup("sad", currentPlayer, "2-POINT FAILED!");
      else if (data.turnover) showPopup("sad", currentPlayer, "TURNOVER ON DOWNS!");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record action. Please try again.",
        variant: "destructive",
      });
    },
  });

  const startDriveMutation = useMutation({
    mutationFn: async (startPosition: number = 30) => {
      return apiRequest("POST", `/api/games/${id}/start-drive`, { startPosition });
    },
    onSuccess: async () => {
      await invalidateGameState();
      setActionMode("offense");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start drive. Please try again.",
        variant: "destructive",
      });
    },
  });

  const chooseConversionMutation = useMutation({
    mutationFn: async (type: "pat" | "two_point") => {
      return apiRequest("POST", `/api/games/${id}/conversion`, { type });
    },
    onSuccess: async (_, type) => {
      await invalidateGameState();
      setActionMode(type === "pat" ? "pat" : "two_point");
    },
  });

  const undoMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/games/${id}/undo`, {}),
    onSuccess: async () => {
      await invalidateGameState();
      toast({ title: "Action undone" });
      resetSelection();
    },
  });

  const bonusDartMutation = useMutation({
    mutationFn: async (data: { segment: number; multiplier: string }) => {
      return apiRequest("POST", `/api/games/${id}/bonus-dart`, data);
    },
    onSuccess: async () => {
      await invalidateGameState();
      resetSelection();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record bonus dart. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (mode: NonNullable<ActionMode>, selectedSegment: DartSegment | null, selectedMultiplier: DartMultiplier | null) => {
    if (selectedSegment === null || !selectedMultiplier) return;

    if (mode === "bonus") {
      bonusDartMutation.mutate({ segment: selectedSegment, multiplier: selectedMultiplier });
      return;
    }

    const actionMap: Record<Exclude<NonNullable<ActionMode>, "bonus">, string> = {
      offense: "dart",
      fg: "fg",
      punt: "punt",
      pat: "conversion",
      two_point: "conversion",
    };

    throwDartMutation.mutate({
      segment: selectedSegment,
      multiplier: selectedMultiplier,
      action: actionMap[mode as Exclude<NonNullable<ActionMode>, "bonus">],
    });
  };

  return {
    invalidateGameState,
    throwDartMutation,
    startDriveMutation,
    chooseConversionMutation,
    undoMutation,
    bonusDartMutation,
    handleSubmit,
  };
}
