import type { Profile, Game, GameEvent, Drive } from "@shared/schema";

export interface GameStateResponse {
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

export type DartSegment =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 25;

export type DartMultiplier =
  | "single_inner"
  | "single_outer"
  | "double"
  | "triple"
  | "inner_bull"
  | "outer_bull"
  | "miss";

export type ActionMode =
  | "offense"
  | "fg"
  | "punt"
  | "pat"
  | "two_point"
  | "bonus"
  | null;
