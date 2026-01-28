import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Crosshair, Target } from "lucide-react";
import type { ActionMode } from "../utils/types";

export function ActionButtons({
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
