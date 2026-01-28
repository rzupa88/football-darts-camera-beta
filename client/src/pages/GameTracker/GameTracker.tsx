import { useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, Play, Trophy, Coins, Undo2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Dartboard from "@/components/Dartboard";
import BroadcastHud from "@/components/BroadcastHud";
import ResultPopup, { type PopupType } from "@/components/ResultPopup";
import MatchupOdds from "@/components/MatchupOdds";
import { cn } from "@/lib/utils";

import { useGameState } from "./hooks/useGameState";
import { useGameActions, type PopupState } from "./hooks/useGameActions";
import { useOtCoinFlip } from "./hooks/useOtCoinFlip";

import type { ActionMode, DartMultiplier, DartSegment } from "./utils/types";
import { formatDartSelection, formatFieldPosition } from "./utils/format";
import { getModeInstruction, getModeTitle } from "./utils/modes";
import { ActionButtons } from "./components/ActionButtons";
import { PlayByPlayFeed } from "./components/PlayByPlayFeed";

export default function GameTracker() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [selectedSegment, setSelectedSegment] = useState<DartSegment | null>(null);
  const [selectedMultiplier, setSelectedMultiplier] = useState<DartMultiplier | null>(null);

  const [popup, setPopup] = useState<PopupState>({ type: null, player: null, message: "" });
  const [cameraMode, setCameraMode] = useState(false);

  const showPopup = useCallback((type: PopupType, player: any, message: string) => {
    setPopup({ type, player, message });
  }, []);

  const clearPopup = useCallback(() => {
    setPopup({ type: null, player: null, message: "" });
  }, []);

  const resetSelection = () => {
    setSelectedSegment(null);
    setSelectedMultiplier(null);
  };

  const { data: gameState, isLoading, gameStateKey } = useGameState({ id, cameraMode });

  const actions = useGameActions({
    id,
    gameStateKey,
    toast,
    gameState,
    resetSelection,
    showPopup,
    setActionMode,
  });

  const ot = useOtCoinFlip({
    id,
    onComplete: actions.invalidateGameState,
    toast,
  });

  const handleDartboardSelect = (segment: DartSegment, multiplier: DartMultiplier) => {
    setSelectedSegment(segment);
    setSelectedMultiplier(multiplier);
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

  const {
    game,
    currentDrive,
    events,
    drives,
    player1,
    player2,
    availableActions,
    awaitingConversion,
    awaitingConversionAttempt,
    pendingConversionType,
    awaitingBonusDart,
    pendingStartPosition,
  } = gameState;

  const isCompleted = game.status === "completed";
  const isAwaitingOTCoinFlip = game.status === "awaiting_ot_coin_flip";
  const currentPlayer = game.possession === 1 ? player1 : player2;

  const needsToStartDrive =
    !isCompleted &&
    !isAwaitingOTCoinFlip &&
    !currentDrive &&
    !awaitingConversion &&
    !awaitingConversionAttempt &&
    !awaitingBonusDart;

  const computeDriveDots = (playerId: string) => {
    const playerDrives = drives.filter((d) => d.playerId === playerId);
    const dots: ("points" | "empty" | "current" | "unused")[] = [];

    for (let i = 0; i < 8; i++) {
      const drive = playerDrives[i];
      if (!drive) dots.push("unused");
      else if (drive.result === null && currentDrive?.id === drive.id) dots.push("current");
      else if (drive.pointsScored > 0) dots.push("points");
      else if (drive.result !== null) dots.push("empty");
      else dots.push("unused");
    }
    return dots;
  };

  const computeOTDriveDots = (playerId: string) => {
    if (game.currentQuarter < 5) return [];
    const otDrives = drives.filter((d) => d.playerId === playerId && d.quarter === game.currentQuarter);
    const dots: ("points" | "empty" | "current" | "unused")[] = [];
    for (let i = 0; i < 2; i++) {
      const drive = otDrives[i];
      if (!drive) dots.push("unused");
      else if (drive.result === null && currentDrive?.id === drive.id) dots.push("current");
      else if (drive.pointsScored > 0) dots.push("points");
      else if (drive.result !== null) dots.push("empty");
      else dots.push("unused");
    }
    return dots;
  };

  const player1Drives = computeDriveDots(player1.id);
  const player2Drives = computeDriveDots(player2.id);
  const player1OTDrives = computeOTDriveDots(player1.id);
  const player2OTDrives = computeOTDriveDots(player2.id);

  const driveStartPosition = currentDrive?.startPosition ?? pendingStartPosition;

  const getEffectiveActionMode = (): ActionMode => {
    if (awaitingBonusDart) return "bonus";
    if (awaitingConversionAttempt && pendingConversionType === "pat") return "pat";
    if (awaitingConversionAttempt && pendingConversionType === "two_point") return "two_point";
    if (currentDrive && !awaitingConversion) return actionMode || "offense";
    return null;
  };

  const effectiveMode = getEffectiveActionMode();
  const canSubmit = selectedSegment !== null && selectedMultiplier !== null && effectiveMode !== null;
  const isPending = actions.throwDartMutation.isPending || actions.bonusDartMutation.isPending;

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

        <Button
          variant={cameraMode ? "default" : "outline"}
          size="sm"
          onClick={() => setCameraMode((v) => !v)}
          className="gap-2"
          data-testid="button-camera-mode"
        >
          {cameraMode ? "Camera Mode: ON" : "Camera Mode: OFF"}
        </Button>
      </div>

      <div className="text-xs opacity-60 mb-2" data-testid="debug-polling">
        status: {game.status} | camera: {cameraMode ? "ON" : "OFF"} | events: {events.length}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel */}
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
              <Dartboard onSelect={handleDartboardSelect} disabled={isPending || !effectiveMode} />

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
                      <Button variant="outline" size="sm" onClick={resetSelection} disabled={isPending}>
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => effectiveMode && actions.handleSubmit(effectiveMode, selectedSegment, selectedMultiplier)}
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
                    <p className="text-sm text-muted-foreground">Tap where your dart landed</p>
                  </div>
                ) : isAwaitingOTCoinFlip ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">Complete the OT coin flip to continue</p>
                  </div>
                ) : needsToStartDrive ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">Start drive to begin throwing</p>
                  </div>
                ) : isCompleted ? (
                  <div className="p-3 bg-muted/50 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">Game completed</p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel */}
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
            <MatchupOdds player1={player1} player2={player2} firstPossession={game.firstPossession} />
          )}

          {!isCompleted && (
            <>
              {isAwaitingOTCoinFlip ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg">
                      {ot.otCoinFlipWinner
                        ? `${ot.otCoinFlipWinner === 1 ? player1.name : player2.name} Wins!`
                        : "Overtime Coin Flip"}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="flex flex-col items-center justify-center py-4">
                    <Trophy className="h-10 w-10 text-amber-500 mb-4" />

                    {!ot.otCoinFlipWinner ? (
                      <>
                        <p className="text-sm text-muted-foreground mb-4 text-center">
                          Game tied! Flip to decide overtime possession
                        </p>
                        <Button
                          size="lg"
                          className={cn("gap-2 min-w-40 transition-transform", ot.isOtFlipping && "animate-spin")}
                          onClick={ot.handleOtCoinFlip}
                          disabled={ot.isOtFlipping}
                          data-testid="button-ot-flip-coin"
                        >
                          <Coins className="h-5 w-5" />
                          {ot.isOtFlipping ? "Flipping..." : "Flip Coin"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-4 text-center">Choose to receive or defer</p>
                        <div className="grid grid-cols-2 gap-4 w-full">
                          <Button
                            size="lg"
                            className="flex flex-col h-auto py-4 gap-1"
                            onClick={() => ot.otCoinFlipMutation.mutate({ winner: ot.otCoinFlipWinner!, choice: "receive" })}
                            disabled={ot.otCoinFlipMutation.isPending}
                            data-testid="button-ot-receive"
                          >
                            <span className="font-bold">Receive</span>
                            <span className="text-xs opacity-80">Get ball first</span>
                          </Button>

                          <Button
                            size="lg"
                            variant="outline"
                            className="flex flex-col h-auto py-4 gap-1"
                            onClick={() => ot.otCoinFlipMutation.mutate({ winner: ot.otCoinFlipWinner!, choice: "defer" })}
                            disabled={ot.otCoinFlipMutation.isPending}
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
                          onClick={() => ot.setOtCoinFlipWinner(null)}
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
                    <p className="font-semibold mb-1">{currentPlayer.name}&apos;s Drive</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Ready to start from {formatFieldPosition(pendingStartPosition)}
                    </p>
                    <Button
                      onClick={() => actions.startDriveMutation.mutate(pendingStartPosition)}
                      disabled={actions.startDriveMutation.isPending}
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
                      onClick={() => actions.chooseConversionMutation.mutate("pat")}
                      disabled={actions.chooseConversionMutation.isPending}
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
                      onClick={() => actions.chooseConversionMutation.mutate("two_point")}
                      disabled={actions.chooseConversionMutation.isPending}
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

          <PlayByPlayFeed events={events} player1={player1} player2={player2} />
        </div>
      </div>

      {!isCompleted && events.length > 1 && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-50"
          onClick={() => actions.undoMutation.mutate()}
          disabled={actions.undoMutation.isPending}
          data-testid="button-undo"
        >
          <Undo2 className="h-5 w-5" />
        </Button>
      )}

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
