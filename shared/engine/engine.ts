// Pure TypeScript game engine - no UI logic
import {
  DartResult,
  Multiplier,
  GameStateEngine,
  DriveState,
  GameEventEngine,
  AvailableActionsEngine,
  PuntResult,
  FGTarget,
  DriveResult,
  FG_EASY_SEGMENTS,
} from "./types";

// Game constants
const DRIVES_PER_PLAYER_PER_QUARTER = 2;

// Utility to generate IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Calculate yards from a dart throw
export function calculateDartYards(
  segment: number,
  multiplier: Multiplier,
): DartResult {
  const isInnerBull = multiplier === "inner_bull";
  const isOuterBull = multiplier === "outer_bull";

  let yards = 0;

  if (multiplier === "miss") {
    yards = 0;
  } else if (isInnerBull) {
    yards = 50; // Auto TD marker - handled separately
  } else if (isOuterBull) {
    yards = 25;
  } else {
    const baseValue = segment;
    switch (multiplier) {
      case "single_inner":
      case "single_outer":
        yards = baseValue;
        break;
      case "double":
        yards = baseValue * 2;
        break;
      case "triple":
        yards = baseValue * 3;
        break;
    }
  }

  return {
    segment,
    multiplier,
    yards,
    isInnerBull,
    isOuterBull,
  };
}

// Format field position for display
export function formatFieldPosition(position: number): string {
  if (position < 50) {
    return `OWN ${position}`;
  } else if (position === 50) {
    return "50";
  } else {
    return `OPP ${100 - position}`;
  }
}

// Create a new game
export function createGame(
  player1Id: string,
  player2Id: string,
  firstPossession: 1 | 2,
): GameStateEngine {
  const gameId = generateId();

  const game: GameStateEngine = {
    id: gameId,
    player1Id,
    player2Id,
    player1Score: 0,
    player2Score: 0,
    currentQuarter: 1,
    possession: firstPossession,
    firstPossession, // Track who started Q1 for halftime flip
    status: "active",
    winnerId: null,
    currentDrive: null,
    drives: [],
    events: [],
    awaitingConversion: false,
    conversionType: null,
    lastTdPlayerId: null,
    overtimePossessions: { player1: 0, player2: 0 },
    otFirstPossession: null,
  };

  // Add game start event
  game.events.push({
    id: generateId(),
    type: "game_start",
    playerId: firstPossession === 1 ? player1Id : player2Id,
    driveId: null,
    data: { firstPossession },
    description: `Game started. ${firstPossession === 1 ? "Player 1" : "Player 2"} receives first.`,
    timestamp: Date.now(),
  });

  return game;
}

// Start a new drive
export function startNextDrive(
  game: GameStateEngine,
  startPosition: number = 30,
): GameStateEngine {
  const currentPlayerId =
    game.possession === 1 ? game.player1Id : game.player2Id;

  const drive: DriveState = {
    id: generateId(),
    playerId: currentPlayerId,
    quarter: game.currentQuarter,
    startPosition,
    currentPosition: startPosition,
    dartCount: 0,
    yardsGained: 0,
    result: null,
    pointsScored: 0,
    awaitingBonusDart: false,
    usedBonusDart: false,
  };

  const updatedGame = {
    ...game,
    currentDrive: drive,
    drives: [...game.drives, drive],
  };

  // Add drive start event
  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "drive_start",
      playerId: currentPlayerId,
      driveId: drive.id,
      data: { startPosition, quarter: game.currentQuarter },
      description: `Drive started at ${formatFieldPosition(startPosition)}`,
      timestamp: Date.now(),
    },
  ];

  return updatedGame;
}

// Get available actions based on current game state
export function getAvailableActions(
  game: GameStateEngine,
): AvailableActionsEngine {
  if (game.status === "completed") {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canUseBonusDart: false,
    };
  }

  if (game.awaitingConversion) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: true,
      canUseBonusDart: false,
    };
  }

  if (!game.currentDrive) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canUseBonusDart: false,
    };
  }

  const drive = game.currentDrive;
  const position = drive.currentPosition;
  const dartCount = drive.dartCount;

  // 4th-dart cushion: if awaiting bonus dart, only that option
  if (drive.awaitingBonusDart) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canUseBonusDart: true,
    };
  }

  // Can always throw if under 4 darts
  const canThrowDart = dartCount < 4;

  // Can attempt FG if position >= 50 (in opponent territory or at midfield)
  const canAttemptFG = position >= 50;

  // Can only punt on 4th dart and position < 50
  const canPunt = dartCount === 3 && position < 50;

  return {
    canThrowDart,
    canAttemptFG,
    canPunt,
    canChooseConversion: false,
    canUseBonusDart: false,
  };
}

// Apply an offensive dart throw
export function applyOffenseDart(
  game: GameStateEngine,
  dartResult: DartResult,
): GameStateEngine {
  if (!game.currentDrive) {
    throw new Error("No active drive");
  }

  const drive = game.currentDrive;
  const playerId = drive.playerId;

  // Inner bull = automatic TD
  if (dartResult.isInnerBull) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      yardsGained: drive.yardsGained + (100 - drive.startPosition),
      currentPosition: 100,
      result: "td",
      pointsScored: 6,
    };

    let updatedGame = updateScore(game, playerId, 6);
    updatedGame = {
      ...updatedGame,
      currentDrive: updatedDrive,
      drives: updatedGame.drives.map((d) =>
        d.id === drive.id ? updatedDrive : d,
      ),
      awaitingConversion: true,
      conversionType: null,
      lastTdPlayerId: playerId,
    };

    // Add events
    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `Inner Bull! Automatic touchdown!`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "touchdown",
        playerId,
        driveId: drive.id,
        data: { innerBull: true },
        description: `TOUCHDOWN! (Inner Bull)`,
        timestamp: Date.now(),
      },
    ];

    return updatedGame;
  }

  // Check for interception: D1, T1, D3, T3
  const isInterception =
    (dartResult.segment === 1 || dartResult.segment === 3) &&
    (dartResult.multiplier === "double" || dartResult.multiplier === "triple");

  if (isInterception) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      result: "interception",
      pointsScored: 0,
    };

    let updatedGame = {
      ...game,
      currentDrive: updatedDrive,
      drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)}`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "interception",
        playerId,
        driveId: drive.id,
        data: {
          segment: dartResult.segment,
          multiplier: dartResult.multiplier,
        },
        description: `INTERCEPTION! ${formatDartResult(dartResult)} - Turnover at ${formatFieldPosition(drive.currentPosition)}`,
        timestamp: Date.now(),
      },
    ];

    // End drive and give opponent the ball at the current position (flipped)
    return endDriveWithInterception(updatedGame, drive.currentPosition);
  }

  // Calculate new position
  const newPosition = Math.min(drive.currentPosition + dartResult.yards, 100);
  const requiredDistance = 100 - drive.startPosition;
  const totalYards = drive.yardsGained + dartResult.yards;

  // Check for TD (exactly reached goal line)
  if (newPosition >= 100 && totalYards === requiredDistance) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      yardsGained: totalYards,
      currentPosition: 100,
      result: "td",
      pointsScored: 6,
    };

    let updatedGame = updateScore(game, playerId, 6);
    updatedGame = {
      ...updatedGame,
      currentDrive: updatedDrive,
      drives: updatedGame.drives.map((d) =>
        d.id === drive.id ? updatedDrive : d,
      ),
      awaitingConversion: true,
      conversionType: null,
      lastTdPlayerId: playerId,
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "touchdown",
        playerId,
        driveId: drive.id,
        data: { innerBull: false },
        description: `TOUCHDOWN! Reached the end zone exactly.`,
        timestamp: Date.now(),
      },
    ];

    return updatedGame;
  }

  // Check for bust (overshot)
  if (totalYards > requiredDistance) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      yardsGained: totalYards,
      currentPosition: newPosition,
      result: "bust",
      pointsScored: 0,
    };

    let updatedGame = {
      ...game,
      currentDrive: updatedDrive,
      drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "bust",
        playerId,
        driveId: drive.id,
        data: { overshoot: totalYards - requiredDistance },
        description: `BUST! Overshot by ${totalYards - requiredDistance} yards.`,
        timestamp: Date.now(),
      },
    ];

    return endDrive(updatedGame);
  }

  // Normal dart - update position
  const updatedDrive: DriveState = {
    ...drive,
    dartCount: drive.dartCount + 1,
    yardsGained: totalYards,
    currentPosition: newPosition,
  };

  let updatedGame = {
    ...game,
    currentDrive: updatedDrive,
    drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "dart",
      playerId,
      driveId: drive.id,
      data: { ...dartResult },
      description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards. Now at ${formatFieldPosition(newPosition)}`,
      timestamp: Date.now(),
    },
  ];

  // Check if 4 darts used
  if (updatedDrive.dartCount >= 4) {
    // 4th-dart cushion rule: If remaining distance is 21-50 and landed exactly 1 yard from goal line
    // The offense gets a bonus dart that must be Single 1 for TD
    const remainingDistance = 100 - newPosition;
    if (remainingDistance === 1 && !updatedDrive.usedBonusDart) {
      // Check if this qualifies for the cushion: original remaining was 21-50
      const originalRemaining = 100 - drive.currentPosition;
      if (originalRemaining >= 21 && originalRemaining <= 50) {
        // Landed at 1-yard line, grant bonus dart
        updatedDrive.awaitingBonusDart = true;
        updatedGame.currentDrive = updatedDrive;
        updatedGame.drives = updatedGame.drives.map((d) =>
          d.id === drive.id ? updatedDrive : d,
        );
        updatedGame.events = [
          ...updatedGame.events,
          {
            id: generateId(),
            type: "dart",
            playerId,
            driveId: drive.id,
            data: { bonusDartEarned: true },
            description: `At the 1-yard line! Bonus dart earned - must hit Single 1 for TD`,
            timestamp: Date.now(),
          },
        ];
        return updatedGame;
      }
    }

    // Normal bust - 4 darts used without scoring
    updatedDrive.result = "bust";
    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "bust",
        playerId,
        driveId: drive.id,
        data: {},
        description: `Drive ended - 4 darts used without scoring.`,
        timestamp: Date.now(),
      },
    ];
    return endDrive(updatedGame);
  }

  return updatedGame;
}

// Apply bonus dart (4th-dart cushion rule)
export function applyBonusDart(
  game: GameStateEngine,
  dartResult: DartResult,
): GameStateEngine {
  if (!game.currentDrive || !game.currentDrive.awaitingBonusDart) {
    throw new Error("No bonus dart available");
  }

  const drive = game.currentDrive;
  const playerId = drive.playerId;

  // Must hit Single 1 for TD
  const isSingle1 =
    (dartResult.multiplier === "single_inner" ||
      dartResult.multiplier === "single_outer") &&
    dartResult.segment === 1;

  if (isSingle1) {
    // Touchdown!
    const updatedDrive: DriveState = {
      ...drive,
      awaitingBonusDart: false,
      usedBonusDart: true,
      result: "td",
      pointsScored: 6,
      currentPosition: 100,
    };

    let updatedGame = updateScore(game, playerId, 6);
    updatedGame = {
      ...updatedGame,
      currentDrive: updatedDrive,
      drives: updatedGame.drives.map((d) =>
        d.id === drive.id ? updatedDrive : d,
      ),
      awaitingConversion: true,
      conversionType: null,
      lastTdPlayerId: playerId,
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult, bonusDart: true },
        description: `Bonus dart: ${formatDartResult(dartResult)}`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "touchdown",
        playerId,
        driveId: drive.id,
        data: { bonusDart: true },
        description: `TOUCHDOWN! (Bonus dart Single 1)`,
        timestamp: Date.now(),
      },
    ];

    return updatedGame;
  } else {
    // Missed bonus dart - drive ends, no score
    const updatedDrive: DriveState = {
      ...drive,
      awaitingBonusDart: false,
      usedBonusDart: true,
      result: "bust",
      pointsScored: 0,
    };

    let updatedGame = {
      ...game,
      currentDrive: updatedDrive,
      drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult, bonusDart: true },
        description: `Bonus dart: ${formatDartResult(dartResult)} - Needed Single 1`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "bust",
        playerId,
        driveId: drive.id,
        data: { bonusDartMissed: true },
        description: `Bonus dart missed! Drive ends.`,
        timestamp: Date.now(),
      },
    ];

    return endDrive(updatedGame);
  }
}

// Get FG target based on opponent yard line
// Uses dartboard segment positions, not numeric ranges
export function getFGTarget(position: number): FGTarget | null {
  if (position < 50) return null;

  const oppYardLine = 100 - position;

  if (oppYardLine >= 40 && oppYardLine <= 50) {
    // Hardest: Any 20
    return { segments: [20], description: "20" };
  } else if (oppYardLine <= 39) {
    // Medium: Any in segments 20, 1, 5
    return { segments: [20, 1, 5], description: "Any Segment 1-20-5" };
  }

  return null;
}

// Check if a segment is valid for a field goal target
export function isValidFGSegment(segment: number, target: FGTarget): boolean {
  return target.segments.includes(segment);
}

// Apply a field goal attempt
export function applyFieldGoalAttempt(
  game: GameStateEngine,
  dartResult: DartResult,
): GameStateEngine {
  if (!game.currentDrive) {
    throw new Error("No active drive");
  }

  const drive = game.currentDrive;
  const playerId = drive.playerId;
  const target = getFGTarget(drive.currentPosition);

  if (!target) {
    throw new Error("Not in FG range");
  }

  // Check if it's a make - any hit (single, double, triple) on target segments counts
  const inRange = isValidFGSegment(dartResult.segment, target);
  const isNotMiss = dartResult.multiplier !== "miss";
  const isMake = inRange && isNotMiss;

  const result: DriveResult = isMake ? "fg_make" : "fg_miss";
  const points = isMake ? 3 : 0;

  const updatedDrive: DriveState = {
    ...drive,
    result,
    pointsScored: points,
  };

  let updatedGame = isMake ? updateScore(game, playerId, 3) : game;
  updatedGame = {
    ...updatedGame,
    currentDrive: updatedDrive,
    drives: updatedGame.drives.map((d) =>
      d.id === drive.id ? updatedDrive : d,
    ),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "fg_attempt",
      playerId,
      driveId: drive.id,
      data: { ...dartResult, target: target.description, made: isMake },
      description: isMake
        ? `FIELD GOAL GOOD! (${formatDartResult(dartResult)}, needed ${target.description})`
        : `Field goal MISSED. (${formatDartResult(dartResult)}, needed ${target.description})`,
      timestamp: Date.now(),
    },
  ];

  return endDrive(updatedGame);
}

// Calculate punt result
export function calculatePuntResult(
  dartResult: DartResult,
  puntPosition: number,
): PuntResult {
  if (dartResult.multiplier === "miss") {
    // Blocked punt - receiving team starts at the flipped position (opponent's territory)
    const flippedPosition = 100 - puntPosition;
    return {
      receivingPosition: flippedPosition,
      returnYards: 0,
      description: `Blocked punt! Opponent takes over at OPP ${100 - flippedPosition}`,
    };
  }

  if (dartResult.isInnerBull) {
    return {
      receivingPosition: 5,
      returnYards: 0,
      description: "Fair catch at OWN 5",
    };
  }

  if (dartResult.isOuterBull) {
    return {
      receivingPosition: 10,
      returnYards: 0,
      description: "Fair catch at OWN 10",
    };
  }

  if (dartResult.multiplier === "triple") {
    // Returned punt
    const returnYards = dartResult.segment * 3;
    const startPos = 20;
    const finalPos = Math.min(startPos + returnYards, 100);
    return {
      receivingPosition: finalPos,
      returnYards,
      description: `Punt returned ${returnYards} yards from OWN 20`,
    };
  }

  if (dartResult.multiplier === "double") {
    // Returned punt
    const returnYards = dartResult.segment * 2;
    const startPos = 20;
    const finalPos = Math.min(startPos + returnYards, 100);
    return {
      receivingPosition: finalPos,
      returnYards,
      description: `Punt returned ${returnYards} yards from OWN 20`,
    };
  }

  // Single (inner or outer)
  if (dartResult.multiplier === "single_inner") {
    return {
      receivingPosition: 30,
      returnYards: 0,
      description: "Fair catch at OWN 30",
    };
  }

  // single_outer
  return {
    receivingPosition: 20,
    returnYards: 0,
    description: "Fair catch at OWN 20",
  };
}

// Apply a punt
export function applyPuntAttempt(
  game: GameStateEngine,
  dartResult: DartResult,
): GameStateEngine {
  if (!game.currentDrive) {
    throw new Error("No active drive");
  }

  const drive = game.currentDrive;
  const playerId = drive.playerId;
  const puntResult = calculatePuntResult(dartResult, drive.currentPosition);

  const updatedDrive: DriveState = {
    ...drive,
    result: "punt",
    pointsScored: 0,
  };

  let updatedGame = {
    ...game,
    currentDrive: updatedDrive,
    drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "punt",
      playerId,
      driveId: drive.id,
      data: { ...dartResult, ...puntResult },
      description: `Punt: ${puntResult.description}`,
      timestamp: Date.now(),
    },
  ];

  // End drive and start next with punt result position
  return endDriveWithPuntPosition(updatedGame, puntResult.receivingPosition);
}

// Choose conversion type after TD
export function chooseConversion(
  game: GameStateEngine,
  type: "pat" | "two_point",
): GameStateEngine {
  if (!game.awaitingConversion) {
    throw new Error("Not awaiting conversion");
  }

  const playerId = game.lastTdPlayerId!;

  return {
    ...game,
    conversionType: type,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "conversion_choice",
        playerId,
        driveId: game.currentDrive?.id ?? null,
        data: { type },
        description:
          type === "pat"
            ? "Going for PAT (1 point)"
            : "Going for 2-point conversion",
        timestamp: Date.now(),
      },
    ],
  };
}

// Apply conversion dart
export function applyConversionDart(
  game: GameStateEngine,
  dartResult: DartResult,
): GameStateEngine {
  if (!game.conversionType) {
    throw new Error("No conversion type selected");
  }

  const playerId = game.lastTdPlayerId!;
  const type = game.conversionType;

  let success = false;
  let points = 0;

  if (type === "pat") {
    // PAT: Must hit any single triangle between 1-5
    const isSingle =
      dartResult.multiplier === "single_inner" ||
      dartResult.multiplier === "single_outer";
    success = isSingle && dartResult.segment >= 1 && dartResult.segment <= 5;
    points = success ? 1 : 0;
  } else {
    // 2-point: Must hit number 2 in any segment
    success = dartResult.segment === 2 && dartResult.multiplier !== "miss";
    points = success ? 2 : 0;
  }

  let updatedGame = success ? updateScore(game, playerId, points) : game;

  updatedGame = {
    ...updatedGame,
    awaitingConversion: false,
    conversionType: null,
    lastTdPlayerId: null,
    events: [
      ...updatedGame.events,
      {
        id: generateId(),
        type: type === "pat" ? "pat_attempt" : "two_point_attempt",
        playerId,
        driveId: game.currentDrive?.id ?? null,
        data: { ...dartResult, success, points },
        description: success
          ? `${type === "pat" ? "PAT" : "2-point conversion"} GOOD! +${points}`
          : `${type === "pat" ? "PAT" : "2-point conversion"} failed.`,
        timestamp: Date.now(),
      },
    ],
  };

  return endDrive(updatedGame);
}

// Update score for a player
function updateScore(
  game: GameStateEngine,
  playerId: string,
  points: number,
): GameStateEngine {
  if (playerId === game.player1Id) {
    return { ...game, player1Score: game.player1Score + points };
  } else {
    return { ...game, player2Score: game.player2Score + points };
  }
}

// End current drive and handle transitions
function endDrive(game: GameStateEngine): GameStateEngine {
  if (!game.currentDrive) return game;

  const drive = game.currentDrive;

  let updatedGame: GameStateEngine = {
    ...game,
    currentDrive: null,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "drive_end",
        playerId: drive.playerId,
        driveId: drive.id,
        data: { result: drive.result, points: drive.pointsScored },
        description: `Drive ended: ${drive.result}`,
        timestamp: Date.now(),
      },
    ],
  };

  // Track overtime possessions
  if (game.status === "overtime") {
    if (drive.playerId === game.player1Id) {
      updatedGame.overtimePossessions.player1++;
    } else {
      updatedGame.overtimePossessions.player2++;
    }
  }

  // Check for OT period end (each player gets 2 drives per OT period)
  if (game.status === "overtime") {
    const DRIVES_PER_PLAYER_PER_OT = 2;
    const bothCompletedPeriod =
      updatedGame.overtimePossessions.player1 >= DRIVES_PER_PLAYER_PER_OT &&
      updatedGame.overtimePossessions.player2 >= DRIVES_PER_PLAYER_PER_OT;

    if (bothCompletedPeriod) {
      if (updatedGame.player1Score !== updatedGame.player2Score) {
        return endGame(updatedGame);
      } else {
        return startNewOTPeriod(updatedGame);
      }
    }
  }

  // Switch possession
  updatedGame.possession = updatedGame.possession === 1 ? 2 : 1;

  // Check for quarter end (each player gets 2 drives per quarter)
  const currentQuarterDrives = updatedGame.drives.filter(
    (d) => d.quarter === updatedGame.currentQuarter,
  );
  const player1Drives = currentQuarterDrives.filter(
    (d) => d.playerId === game.player1Id,
  ).length;
  const player2Drives = currentQuarterDrives.filter(
    (d) => d.playerId === game.player2Id,
  ).length;

  if (
    player1Drives >= DRIVES_PER_PLAYER_PER_QUARTER &&
    player2Drives >= DRIVES_PER_PLAYER_PER_QUARTER
  ) {
    return endQuarter(updatedGame);
  }

  return updatedGame;
}

// End drive with specific punt position for next drive
function endDriveWithPuntPosition(
  game: GameStateEngine,
  nextStartPosition: number,
): GameStateEngine {
  let updatedGame = endDrive(game);

  // Store the punt position for the next drive
  (updatedGame as any)._nextDriveStartPosition = nextStartPosition;

  return updatedGame;
}

// End drive with interception - opponent takes over at the spot (flipped)
function endDriveWithInterception(
  game: GameStateEngine,
  interceptionPosition: number,
): GameStateEngine {
  // Flip the position for the opponent's perspective
  // e.g., if intercepted at position 60 (OPP 40), opponent starts at their OWN 40
  const opponentStartPosition = 100 - interceptionPosition;

  let updatedGame = endDrive(game);

  // Store the interception position for the next drive
  (updatedGame as any)._nextDriveStartPosition = opponentStartPosition;

  return updatedGame;
}

// End current quarter
function endQuarter(game: GameStateEngine): GameStateEngine {
  const nextQuarter = game.currentQuarter + 1;

  let updatedGame: GameStateEngine = {
    ...game,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "quarter_end",
        playerId: game.possession === 1 ? game.player1Id : game.player2Id,
        driveId: null,
        data: { quarter: game.currentQuarter },
        description: `Quarter ${game.currentQuarter} ended`,
        timestamp: Date.now(),
      },
    ],
  };

  // Check for end of regulation
  if (nextQuarter > 4) {
    if (game.player1Score === game.player2Score) {
      // Go to overtime
      return startOvertime(updatedGame);
    } else {
      return endGame(updatedGame);
    }
  }

  updatedGame.currentQuarter = nextQuarter;

  // Halftime possession flip: Q3 goes to whoever didn't start Q1
  if (nextQuarter === 3) {
    updatedGame.possession = game.firstPossession === 1 ? 2 : 1;
  }

  return updatedGame;
}

// Start overtime
function startOvertime(game: GameStateEngine): GameStateEngine {
  return {
    ...game,
    status: "overtime",
    currentQuarter: 5,
    overtimePossessions: { player1: 0, player2: 0 },
    otFirstPossession: game.possession,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "overtime_start",
        playerId: game.possession === 1 ? game.player1Id : game.player2Id,
        driveId: null,
        data: {},
        description: "Overtime started!",
        timestamp: Date.now(),
      },
    ],
  };
}

// Start new OT period (when still tied after both players had 2 drives)
// Same player goes first - no new coin flip
function startNewOTPeriod(game: GameStateEngine): GameStateEngine {
  const otPeriod = game.currentQuarter - 4;
  const nextOtPeriod = otPeriod + 1;
  const startingPossession = game.otFirstPossession ?? game.possession;

  return {
    ...game,
    currentQuarter: 5 + nextOtPeriod - 1,
    possession: startingPossession,
    overtimePossessions: { player1: 0, player2: 0 },
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "overtime_start",
        playerId: startingPossession === 1 ? game.player1Id : game.player2Id,
        driveId: null,
        data: { period: nextOtPeriod },
        description: `Overtime Period ${nextOtPeriod} - Still tied!`,
        timestamp: Date.now(),
      },
    ],
  };
}

// End the game
function endGame(game: GameStateEngine): GameStateEngine {
  const winnerId =
    game.player1Score > game.player2Score
      ? game.player1Id
      : game.player2Score > game.player1Score
        ? game.player2Id
        : null;

  return {
    ...game,
    status: "completed",
    winnerId,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "game_end",
        playerId: winnerId ?? game.player1Id,
        driveId: null,
        data: {
          player1Score: game.player1Score,
          player2Score: game.player2Score,
          winnerId,
        },
        description: winnerId
          ? `Game Over! Final: ${game.player1Score} - ${game.player2Score}`
          : `Game ended in a tie: ${game.player1Score} - ${game.player2Score}`,
        timestamp: Date.now(),
      },
    ],
  };
}

// Advance the game state (start next drive if needed)
export function advance(game: GameStateEngine): GameStateEngine {
  if (game.status === "completed") return game;
  if (game.currentDrive) return game;
  if (game.awaitingConversion) return game;

  // Check for punt position override
  const puntPosition = (game as any)._nextDriveStartPosition;
  delete (game as any)._nextDriveStartPosition;

  return startNextDrive(game, puntPosition ?? 30);
}

// Undo last event (replay from beginning minus last event)
export function undo(game: GameStateEngine): GameStateEngine {
  if (game.events.length <= 1) return game;

  // For simplicity, we'll just remove the last event and recalculate
  // In a full implementation, you'd replay all events from scratch
  const events = game.events.slice(0, -1);

  // This is a simplified undo - in production you'd replay events
  return {
    ...game,
    events,
  };
}

// Format dart result for display
function formatDartResult(dart: DartResult): string {
  if (dart.multiplier === "miss") return "Miss";
  if (dart.isInnerBull) return "Inner Bull";
  if (dart.isOuterBull) return "Outer Bull (25)";

  const prefix =
    dart.multiplier === "triple"
      ? "T"
      : dart.multiplier === "double"
        ? "D"
        : "S";

  return `${prefix}${dart.segment}`;
}

// Export format function for use elsewhere
export { formatDartResult };
