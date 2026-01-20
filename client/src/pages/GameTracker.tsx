import { useState, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Target,
  Crosshair,
  Undo2,
  Trophy,
  ArrowRight,
  Circle,
  Play,
  Check,
  Coins,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Profile, Game, GameEvent, Drive } from "@shared/schema";
import { cn } from "@/lib/utils";
import Dartboard from "@/components/Dartboard";
import BroadcastHud from "@/components/BroadcastHud";
import ResultPopup, { type PopupType } from "@/components/ResultPopup";
import MatchupOdds from "@/components/MatchupOdds";
import bustSoundUrl from "@assets/Audio_01_15_2026_16_10_03_Sheldon_(mp3cut.net)_1768513329100.mp3";

interface GameStateResponse {
  game: Game;
  currentDrive: Drive | null;
  events: GameEvent[];
  drives: Drive[];
  player1: Profile;
  player2: Profile;
  availableActions: {
    canThrowDart: boolean;
    canAttemptFG: boolean;
    canPunt: boolean;
    canChooseConversion: boolean;
    canAttemptConversion: boolean;
    canUseBonusDart: boolean;
  };
  awaitingConversion: boolean;
  awaitingConversionAttempt: boolean;
  pendingConversionType: "pat" | "two_point" | null;
  awaitingBonusDart: boolean;
  pendingStartPosition: number;
}

export type DriveDotState = "points" | "empty" | "current" | "unused";

type DartSegment = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 25;
type DartMultiplier = "single_inner" | "single_outer" | "double" | "triple" | "inner_bull" | "outer_bull" | "miss";

type ActionMode = "offense" | "fg" | "punt" | "pat" | "two_point" | "bonus" | null;

interface PopupState {
  type: PopupType;
  player: Profile | null;
  message: string;
}

export default function GameTracker() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [selectedSegment, setSelectedSegment] = useState<DartSegment | null>(null);
  const [selectedMultiplier, setSelectedMultiplier] = useState<DartMultiplier | null>(null);
  const [popup, setPopup] = useState<PopupState>({ type: null, player: null, message: "" });
  const [otCoinFlipWinner, setOtCoinFlipWinner] = useState<1 | 2 | null>(null);
  const [isOtFlipping, setIsOtFlipping] = useState(false);
  const bustSoundRef = useRef<HTMLAudioElement | null>(null);
  
  if (!bustSoundRef.current) {
    bustSoundRef.current = new Audio(bustSoundUrl);
  }

  const handleOtCoinFlip = () => {
    setIsOtFlipping(true);
    setTimeout(() => {
      const result = Math.random() < 0.5 ? 1 : 2;
      setOtCoinFlipWinner(result as 1 | 2);
      setIsOtFlipping(false);
    }, 800);
  };

  const showPopup = useCallback((type: PopupType, player: Profile | null, message: string) => {
    setPopup({ type, player, message });
  }, []);

  const clearPopup = useCallback(() => {
    setPopup({ type: null, player: null, message: "" });
  }, []);

  const { data: gameState, isLoading, refetch } = useQuery<GameStateResponse>({
    queryKey: ["/api/games", id, "state"],
  });

  const throwDartMutation = useMutation({
    mutationFn: async (data: { segment: number; multiplier: string; action: string }) => {
      const res = await apiRequest("POST", `/api/games/${id}/action`, data);
      return res.json() as Promise<{ 
        success?: boolean; 
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", id, "state"] });
      refetch();
      resetSelection();
      
      if (!gameState) return;
      const currentPlayer = gameState.game.possession === 1 ? gameState.player1 : gameState.player2;
      
      if (data.touchdown) {
        showPopup("celebration", currentPlayer, "TOUCHDOWN!");
      } else if (data.bust) {
        if (bustSoundRef.current) {
          bustSoundRef.current.currentTime = 0;
          bustSoundRef.current.play().catch(() => {});
        }
        showPopup("sad", currentPlayer, "BUST!");
      } else if (data.interception) {
        showPopup("sad", currentPlayer, "INTERCEPTION!");
      } else if (data.safety) {
        showPopup("sad", currentPlayer, "SAFETY!");
      } else if (data.fgMade) {
        showPopup("celebration", currentPlayer, "FIELD GOAL!");
      } else if (data.fgMissed) {
        showPopup("sad", currentPlayer, "MISSED FG!");
      } else if (data.patMade) {
        showPopup("celebration", currentPlayer, "PAT GOOD!");
      } else if (data.patMissed) {
        showPopup("sad", currentPlayer, "PAT MISSED!");
      } else if (data.twoPointMade) {
        showPopup("celebration", currentPlayer, "2-POINT CONVERSION!");
      } else if (data.twoPointMissed) {
        showPopup("sad", currentPlayer, "2-POINT FAILED!");
      } else if (data.turnover) {
        showPopup("sad", currentPlayer, "TURNOVER ON DOWNS!");
      }
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", id, "state"] });
      refetch();
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
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", id, "state"] });
      refetch();
      setActionMode(type === "pat" ? "pat" : "two_point");
    },
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/games/${id}/undo`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", id, "state"] });
      refetch();
      toast({ title: "Action undone" });
      resetSelection();
    },
  });

  const bonusDartMutation = useMutation({
    mutationFn: async (data: { segment: number; multiplier: string }) => {
      return apiRequest("POST", `/api/games/${id}/bonus-dart`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", id, "state"] });
      refetch();
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

  const otCoinFlipMutation = useMutation({
    mutationFn: async ({ winner, choice }: { winner: 1 | 2; choice: "receive" | "defer" }) => {
      return apiRequest("POST", `/api/games/${id}/ot-coin-flip`, { winner, choice });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", id, "state"] });
      refetch();
      setOtCoinFlipWinner(null);
      toast({ title: "Overtime coin flip complete!" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process OT coin flip. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetSelection = () => {
    setSelectedSegment(null);
    setSelectedMultiplier(null);
  };

  const handleDartboardSelect = (segment: DartSegment, multiplier: DartMultiplier) => {
    setSelectedSegment(segment);
    setSelectedMultiplier(multiplier);
  };

  const handleSubmit = (mode: NonNullable<ActionMode>) => {
    if (selectedSegment === null || !selectedMultiplier) return;

    if (mode === "bonus") {
      bonusDartMutation.mutate({
        segment: selectedSegment,
        multiplier: selectedMultiplier,
      });
    } else {
      const actionMap: Record<NonNullable<ActionMode>, string> = {
        offense: "dart",
        fg: "fg",
        punt: "punt",
        pat: "conversion",
        two_point: "conversion",
        bonus: "dart",
      };
      throwDartMutation.mutate({
        segment: selectedSegment,
        multiplier: selectedMultiplier,
        action: actionMap[mode],
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold mb-2">Game Not Found</h3>
            <Link href="/history">
              <Button>Back to History</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { game, currentDrive, events, drives, player1, player2, availableActions, awaitingConversion, awaitingConversionAttempt, pendingConversionType, awaitingBonusDart, pendingStartPosition } = gameState;
  const isCompleted = game.status === "completed";
  const isAwaitingOTCoinFlip = game.status === "awaiting_ot_coin_flip";
  const currentPlayer = game.possession === 1 ? player1 : player2;

  const needsToStartDrive = !isCompleted && !isAwaitingOTCoinFlip && !currentDrive && !awaitingConversion && !awaitingConversionAttempt && !awaitingBonusDart;

  // Compute drive summaries for display (8 dots per player)
  const computeDriveDots = (playerId: string): DriveDotState[] => {
    const playerDrives = drives.filter(d => d.playerId === playerId);
    const dots: DriveDotState[] = [];
    
    for (let i = 0; i < 8; i++) {
      const drive = playerDrives[i];
      if (!drive) {
        dots.push("unused");
      } else if (drive.result === null && currentDrive?.id === drive.id) {
        dots.push("current");
      } else if (drive.pointsScored > 0) {
        dots.push("points");
      } else if (drive.result !== null) {
        dots.push("empty");
      } else {
        dots.push("unused");
      }
    }
    return dots;
  };

  const player1Drives = computeDriveDots(player1.id);
  const player2Drives = computeDriveDots(player2.id);
  
  // Compute OT drive dots (2 per player per OT period, only shows current period)
  const computeOTDriveDots = (playerId: string): DriveDotState[] => {
    if (game.currentQuarter < 5) return [];
    
    const currentOTPeriod = game.currentQuarter;
    const otDrives = drives.filter(d => d.playerId === playerId && d.quarter === currentOTPeriod);
    const dots: DriveDotState[] = [];
    
    for (let i = 0; i < 2; i++) {
      const drive = otDrives[i];
      if (!drive) {
        dots.push("unused");
      } else if (drive.result === null && currentDrive?.id === drive.id) {
        dots.push("current");
      } else if (drive.pointsScored > 0) {
        dots.push("points");
      } else if (drive.result !== null) {
        dots.push("empty");
      } else {
        dots.push("unused");
      }
    }
    return dots;
  };

  const player1OTDrives = computeOTDriveDots(player1.id);
  const player2OTDrives = computeOTDriveDots(player2.id);
  const driveStartPosition = currentDrive?.startPosition ?? pendingStartPosition;

  // Determine the current action mode based on game state
  const getEffectiveActionMode = (): ActionMode => {
    if (awaitingBonusDart) return "bonus";
    if (awaitingConversionAttempt && pendingConversionType === "pat") return "pat";
    if (awaitingConversionAttempt && pendingConversionType === "two_point") return "two_point";
    if (currentDrive && !awaitingConversion) return actionMode || "offense";
    return null;
  };

  const effectiveMode = getEffectiveActionMode();
  const canSubmit = selectedSegment !== null && selectedMultiplier !== null && effectiveMode !== null;
  const isPending = throwDartMutation.isPending || bonusDartMutation.isPending;

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <Link href="/history">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Badge variant={isCompleted ? "secondary" : "default"} data-testid="badge-game-status">
          {isCompleted ? "Completed" : game.status === "overtime" ? "Overtime" : `Q${game.currentQuarter}`}
        </Badge>
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Dartboard */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">
                  {effectiveMode ? getModeTitle(effectiveMode) : "Dartboard"}
                </CardTitle>
                {effectiveMode && (
                  <Badge variant="outline" className="text-xs">
                    {getModeInstruction(effectiveMode)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Dartboard
                onSelect={handleDartboardSelect}
                disabled={isPending || !effectiveMode}
              />

              {/* Selection display and submit */}
              <div className="mt-4 space-y-3">
                {selectedSegment !== null && selectedMultiplier ? (
                  <div className="flex items-center justify-between gap-4 p-3 bg-muted rounded-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Selected</p>
                      <p className="font-medium">
                        {formatDartSelection(selectedSegment, selectedMultiplier)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetSelection}
                        disabled={isPending}
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => effectiveMode && handleSubmit(effectiveMode)}
                        disabled={!canSubmit || isPending}
                        className="gap-1"
                        data-testid="button-submit-dart"
                      >
                        <Check className="h-4 w-4" />
                        {isPending ? "Recording..." : "Record"}
                      </Button>
                    </div>
                  </div>
                ) : effectiveMode ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">
                      Tap where your dart landed
                    </p>
                  </div>
                ) : isAwaitingOTCoinFlip ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">
                      Complete the OT coin flip to continue
                    </p>
                  </div>
                ) : needsToStartDrive ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">
                      Start drive to begin throwing
                    </p>
                  </div>
                ) : isCompleted ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">
                      Game completed
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Game Info & Play-by-Play */}
        <div className="space-y-4">
          <BroadcastHud
            player1={player1}
            player2={player2}
            player1Score={game.player1Score}
            player2Score={game.player2Score}
            possession={game.possession}
            currentQuarter={game.currentQuarter}
            position={currentDrive?.currentPosition ?? pendingStartPosition}
            driveStartPosition={driveStartPosition}
            dartsUsed={currentDrive?.dartCount ?? 0}
            isCompleted={isCompleted}
            winnerId={game.winnerId}
            player1Drives={player1Drives}
            player2Drives={player2Drives}
            player1OTDrives={player1OTDrives}
            player2OTDrives={player2OTDrives}
          />

          {!isCompleted && (
            <MatchupOdds 
              player1={player1} 
              player2={player2} 
              firstPossession={game.firstPossession} 
            />
          )}

          {!isCompleted && (
            <>
              {/* Action Console */}
              {isAwaitingOTCoinFlip ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg">
                      {otCoinFlipWinner 
                        ? `${otCoinFlipWinner === 1 ? player1.name : player2.name} Wins!`
                        : "Overtime Coin Flip"
                      }
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center py-4">
                    <Trophy className="h-10 w-10 text-amber-500 mb-4" />
                    
                    {!otCoinFlipWinner ? (
                      <>
                        <p className="text-sm text-muted-foreground mb-4 text-center">
                          Game tied! Flip to decide overtime possession
                        </p>
                        <Button
                          size="lg"
                          className={cn(
                            "gap-2 min-w-40 transition-transform",
                            isOtFlipping && "animate-spin"
                          )}
                          onClick={handleOtCoinFlip}
                          disabled={isOtFlipping}
                          data-testid="button-ot-flip-coin"
                        >
                          <Coins className="h-5 w-5" />
                          {isOtFlipping ? "Flipping..." : "Flip Coin"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-4 text-center">
                          Choose to receive or defer
                        </p>
                        <div className="grid grid-cols-2 gap-4 w-full">
                          <Button
                            size="lg"
                            className="flex flex-col h-auto py-4 gap-1"
                            onClick={() => otCoinFlipMutation.mutate({ winner: otCoinFlipWinner, choice: "receive" })}
                            disabled={otCoinFlipMutation.isPending}
                            data-testid="button-ot-receive"
                          >
                            <span className="font-bold">Receive</span>
                            <span className="text-xs opacity-80">Get ball first</span>
                          </Button>
                          <Button
                            size="lg"
                            variant="outline"
                            className="flex flex-col h-auto py-4 gap-1"
                            onClick={() => otCoinFlipMutation.mutate({ winner: otCoinFlipWinner, choice: "defer" })}
                            disabled={otCoinFlipMutation.isPending}
                            data-testid="button-ot-defer"
                          >
                            <span className="font-bold">Defer</span>
                            <span className="text-xs opacity-80">Opponent first</span>
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3"
                          onClick={() => setOtCoinFlipWinner(null)}
                          data-testid="button-ot-reflip"
                        >
                          Reflip
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : needsToStartDrive ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-6">
                    <Play className="h-8 w-8 text-primary mb-3" />
                    <p className="font-semibold mb-1">{currentPlayer.name}'s Drive</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Ready to start from {formatFieldPosition(pendingStartPosition)}
                    </p>
                    <Button
                      onClick={() => startDriveMutation.mutate(pendingStartPosition)}
                      disabled={startDriveMutation.isPending}
                      className="gap-2"
                      data-testid="button-start-drive"
                    >
                      <Play className="h-4 w-4" />
                      Start Drive
                    </Button>
                  </CardContent>
                </Card>
              ) : awaitingConversion ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg">Touchdown! Choose Conversion</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-row items-center justify-center gap-4">
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 min-h-14"
                      onClick={() => chooseConversionMutation.mutate("pat")}
                      disabled={chooseConversionMutation.isPending}
                      data-testid="button-choose-pat"
                    >
                      <div className="text-center">
                        <div className="font-bold">PAT</div>
                        <div className="text-xs opacity-80">1 Point</div>
                      </div>
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 min-h-14"
                      onClick={() => chooseConversionMutation.mutate("two_point")}
                      disabled={chooseConversionMutation.isPending}
                      data-testid="button-choose-2pt"
                    >
                      <div className="text-center">
                        <div className="font-bold">2-Point</div>
                        <div className="text-xs opacity-80">2 Points</div>
                      </div>
                    </Button>
                  </CardContent>
                </Card>
              ) : awaitingBonusDart ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg">Bonus Dart Earned!</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-sm text-muted-foreground">
                      You reached the 1-yard line on your 4th dart! Hit Single 1 for a touchdown.
                    </p>
                    <p className="text-sm font-medium mt-2">Tap the dartboard to record your throw</p>
                  </CardContent>
                </Card>
              ) : awaitingConversionAttempt ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg">
                      {pendingConversionType === "pat" ? "PAT Attempt" : "2-Point Attempt"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {pendingConversionType === "pat" 
                        ? "Hit Single 1, 5, or 20 for the extra point" 
                        : "Hit the number 2 (any segment) for 2 points"}
                    </p>
                    <p className="text-sm font-medium mt-2">Tap the dartboard to record your throw</p>
                  </CardContent>
                </Card>
              ) : currentDrive ? (
                <ActionButtons
                  availableActions={availableActions}
                  currentMode={actionMode}
                  onSelectMode={setActionMode}
                />
              ) : null}
            </>
          )}

          {isCompleted && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Trophy className="h-12 w-12 text-primary mb-4" />
                <h2 className="text-2xl font-bold mb-2">Game Over</h2>
                <p className="text-muted-foreground">
                  {game.winnerId === player1.id
                    ? player1.name
                    : game.winnerId === player2.id
                    ? player2.name
                    : "Tie"}{" "}
                  {game.winnerId ? "wins!" : "game"}
                </p>
                <div className="flex gap-4 mt-6">
                  <Link href="/new">
                    <Button data-testid="button-new-game">New Game</Button>
                  </Link>
                  <Link href="/history">
                    <Button variant="outline">View History</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <PlayByPlayFeed events={events} player1={player1} player2={player2} />
        </div>
      </div>

      {/* Floating undo button */}
      {!isCompleted && events.length > 1 && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-50"
          onClick={() => undoMutation.mutate()}
          disabled={undoMutation.isPending}
          data-testid="button-undo"
        >
          <Undo2 className="h-5 w-5" />
        </Button>
      )}

      {/* Result popup for celebrations/sad moments */}
      <ResultPopup
        type={popup.type}
        player={popup.player}
        message={popup.message}
        duration={3500}
        onClose={clearPopup}
      />
    </div>
  );
}

function getModeTitle(mode: ActionMode): string {
  switch (mode) {
    case "offense": return "Offense";
    case "fg": return "Field Goal Attempt";
    case "punt": return "Punt";
    case "pat": return "PAT Attempt";
    case "two_point": return "2-Point Attempt";
    case "bonus": return "Bonus Dart";
    default: return "Dartboard";
  }
}

function getModeInstruction(mode: ActionMode): string {
  switch (mode) {
    case "offense": return "Advance the ball";
    case "fg": return "Hit target for 3 pts";
    case "punt": return "Pin opponent deep";
    case "pat": return "Single 1/5/20 = 1 pt";
    case "two_point": return "Hit #2 = 2 pts";
    case "bonus": return "Single 1 = TD!";
    default: return "";
  }
}

function Scoreboard({
  player1,
  player2,
  player1Score,
  player2Score,
  possession,
  isCompleted,
  winnerId,
}: {
  player1: Profile;
  player2: Profile;
  player1Score: number;
  player2Score: number;
  possession: number;
  isCompleted: boolean;
  winnerId: string | null;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              {!isCompleted && possession === 1 && (
                <Crosshair className="h-4 w-4 text-primary animate-pulse" />
              )}
              {isCompleted && winnerId === player1.id && (
                <Trophy className="h-4 w-4 text-primary" />
              )}
              <p className="font-semibold truncate text-sm" data-testid="text-player1-name">
                {player1.name}
              </p>
            </div>
            <p
              className="text-4xl md:text-5xl font-bold font-mono text-primary"
              data-testid="text-player1-score"
            >
              {player1Score}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl text-muted-foreground">vs</span>
            {!isCompleted && (
              <ArrowRight
                className={cn(
                  "h-5 w-5 text-primary transition-transform",
                  possession === 1 && "rotate-180"
                )}
              />
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              {!isCompleted && possession === 2 && (
                <Crosshair className="h-4 w-4 text-primary animate-pulse" />
              )}
              {isCompleted && winnerId === player2.id && (
                <Trophy className="h-4 w-4 text-primary" />
              )}
              <p className="font-semibold truncate text-sm" data-testid="text-player2-name">
                {player2.name}
              </p>
            </div>
            <p
              className="text-4xl md:text-5xl font-bold font-mono text-primary"
              data-testid="text-player2-score"
            >
              {player2Score}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldPosition({ position, startPosition }: { position: number; startPosition: number }) {
  const displayPosition = formatFieldPosition(position);
  const progressPercent = (position / 100) * 100;

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>OWN</span>
          <span className="font-mono font-bold text-base text-foreground" data-testid="text-field-position">
            {displayPosition}
          </span>
          <span>OPP</span>
        </div>
        <div className="relative h-3 bg-muted rounded-full overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="w-1/2 border-r border-dashed border-muted-foreground/30" />
            <div className="w-1/2" />
          </div>
          <div
            className="absolute top-0 left-0 h-full bg-primary/30 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-0 h-full w-2 bg-primary rounded-full transition-all duration-300"
            style={{ left: `calc(${progressPercent}% - 4px)` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </CardContent>
    </Card>
  );
}

function formatFieldPosition(position: number): string {
  if (position < 50) {
    return `OWN ${position}`;
  } else if (position === 50) {
    return "50";
  } else {
    return `OPP ${100 - position}`;
  }
}

function DartCounter({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="text-sm text-muted-foreground">Darts:</span>
      {[1, 2, 3, 4].map((num) => (
        <Circle
          key={num}
          className={cn(
            "h-4 w-4 transition-colors",
            num <= count ? "fill-primary text-primary" : "text-muted-foreground"
          )}
          data-testid={`dart-indicator-${num}`}
        />
      ))}
    </div>
  );
}

function ActionButtons({
  availableActions,
  currentMode,
  onSelectMode,
}: {
  availableActions: {
    canThrowDart: boolean;
    canAttemptFG: boolean;
    canPunt: boolean;
  };
  currentMode: ActionMode;
  onSelectMode: (mode: ActionMode) => void;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            variant={currentMode === "offense" ? "default" : "outline"}
            disabled={!availableActions.canThrowDart}
            onClick={() => onSelectMode("offense")}
            className="gap-1"
            data-testid="button-mode-offense"
          >
            <Target className="h-4 w-4" />
            Offense
          </Button>
          <Button
            size="sm"
            variant={currentMode === "fg" ? "default" : "outline"}
            disabled={!availableActions.canAttemptFG}
            onClick={() => onSelectMode("fg")}
            className="gap-1"
            data-testid="button-mode-fg"
          >
            <Crosshair className="h-4 w-4" />
            Field Goal
          </Button>
          <Button
            size="sm"
            variant={currentMode === "punt" ? "default" : "outline"}
            disabled={!availableActions.canPunt}
            onClick={() => onSelectMode("punt")}
            className="gap-1"
            data-testid="button-mode-punt"
          >
            <ArrowRight className="h-4 w-4" />
            Punt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlayByPlayFeed({
  events,
  player1,
  player2,
}: {
  events: GameEvent[];
  player1: Profile;
  player2: Profile;
}) {
  const sortedEvents = [...events].reverse();

  const getPlayerName = (playerId: string) => {
    if (playerId === player1.id) return player1.name;
    if (playerId === player2.id) return player2.name;
    return "Unknown";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Play-by-Play</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 lg:h-64">
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No events yet
            </p>
          ) : (
            <div className="space-y-2">
              {sortedEvents.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className={cn(
                    "flex items-start gap-3 py-2 px-3 rounded-md",
                    event.type === "touchdown" && "bg-primary/10",
                    event.type === "game_end" && "bg-accent"
                  )}
                  data-testid={`event-${event.id || idx}`}
                >
                  <EventIcon type={event.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{event.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {getPlayerName(event.playerId)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case "touchdown":
      return <Trophy className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />;
    case "dart":
      return <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
    case "fg_attempt":
      return <Crosshair className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
    case "game_start":
    case "drive_start":
      return <Play className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
  }
}

function formatDartSelection(segment: DartSegment, multiplier: DartMultiplier): string {
  if (multiplier === "miss") return "Miss";
  if (multiplier === "inner_bull") return "Inner Bull (Auto TD!)";
  if (multiplier === "outer_bull") return "Outer Bull (25 yards)";

  const prefix =
    multiplier === "triple" ? "T" : multiplier === "double" ? "D" : "S";
  const suffix = multiplier === "single_inner" ? " (inner)" : multiplier === "single_outer" ? " (outer)" : "";

  let yards = segment;
  if (multiplier === "double") yards = segment * 2;
  if (multiplier === "triple") yards = segment * 3;

  return `${prefix}${segment}${suffix} (${yards} yards)`;
}
