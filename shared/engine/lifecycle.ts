// shared/engine/lifecycle.ts
import { GameStateEngine } from "./types";
import { generateId } from "./ids";

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
