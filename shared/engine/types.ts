// Pure TypeScript game engine types

export type Multiplier = "single_inner" | "single_outer" | "double" | "triple" | "inner_bull" | "outer_bull" | "miss";

export type DartHitSource = "manual" | "camera";

export interface DartHit {
  /** Raw board read (manual click or camera detection) */
  segment: number; // 0-20, 25 for bull
  multiplier: Multiplier;
  source: DartHitSource;
  timestamp: number;

  /** Camera-only: confidence 0..1 */
  confidence?: number;

  /** Optional raw details for debugging/replay */
  raw?: {
    x?: number;
    y?: number;
    frameId?: string;
  };
}


export interface DartResult {
  segment: number; // 0-20, 25 for bull
  multiplier: Multiplier;
  yards: number;
  isInnerBull: boolean;
  isOuterBull: boolean;
}

export interface DriveState {
  id: string;
  playerId: string;
  quarter: number;
  startPosition: number;
  currentPosition: number;
  dartCount: number;
  yardsGained: number;
  result: DriveResult | null;
  pointsScored: number;
  // 4th-dart cushion rule: when at 1 yard from goal line, get bonus dart
  awaitingBonusDart: boolean;
  usedBonusDart: boolean;
}

export type DriveResult = "td" | "fg_make" | "fg_miss" | "punt" | "bust" | "interception";

export interface GameStateEngine {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  currentQuarter: number;
  possession: 1 | 2; // 1 = player1, 2 = player2
  firstPossession: 1 | 2; // Track who started Q1 for halftime flip
  status: "active" | "overtime" | "completed";
  winnerId: string | null;
  currentDrive: DriveState | null;
  drives: DriveState[];
  events: GameEventEngine[];
  awaitingConversion: boolean;
  conversionType: "pat" | "two_point" | null;
  lastTdPlayerId: string | null;
  // Track overtime possessions
  overtimePossessions: { player1: number; player2: number };
  // Track who should start each OT period (set by coin flip)
  otFirstPossession: 1 | 2 | null;
}

export interface GameEventEngine {
  id: string;
  type: EventType;
  playerId: string;
  driveId: string | null;
  data: Record<string, unknown>;
  description: string;
  timestamp: number;
}

export type EventType = 
  | "game_start"
  | "drive_start"
  | "dart"
  | "touchdown"
  | "conversion_choice"
  | "pat_attempt"
  | "two_point_attempt"
  | "fg_attempt"
  | "punt"
  | "bust"
  | "interception"
  | "drive_end"
  | "quarter_end"
  | "overtime_start"
  | "game_end";

export interface AvailableActionsEngine {
  canThrowDart: boolean;
  canAttemptFG: boolean;
  canPunt: boolean;
  canChooseConversion: boolean;
  canUseBonusDart: boolean; // 4th-dart cushion bonus dart
}

export interface PuntResult {
  receivingPosition: number;
  returnYards: number;
  description: string;
}

export interface FGTarget {
  segments: number[]; // Valid segments for the field goal
  description: string;
}

// Standard dartboard segment order (clockwise from top)
// 20 is at top, going clockwise: 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
export const DARTBOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Segments between 12 and 18 on the dartboard (top section going 12 -> 5 -> 20 -> 1 -> 18)
export const FG_EASY_SEGMENTS = [12, 5, 20, 1, 18];
