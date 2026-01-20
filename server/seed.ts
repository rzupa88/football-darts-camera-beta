import { db } from "./db";
import { profiles, games, drives, events, dartThrows, rulesets } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Check if profiles already exist
  const existingProfiles = await db.select().from(profiles);
  if (existingProfiles.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  // Create rulesets
  const [ruleset] = await db.insert(rulesets).values({
    version: "0.9",
    rulesMarkdown: `# Football Dart Game Rules v0.9

## Field Model
- Field = 0-100 yards
- OWN 0 = your goal, 50 = midfield, OPP 0 = opponent's goal (100)
- Default drive start: OWN 30

## Scoring
- **Touchdown**: 6 points (Inner Bull = auto TD, or exact distance)
- **PAT**: 1 point (Single 1-5)
- **2-Point**: 2 points (Hit number 2 in any segment)
- **Field Goal**: 3 points (based on distance)
  - 0-29 yd line: Single in 12, 5, 20, 1, or 18 (dartboard top arc)
  - 30-39 yd line: Single 1-5
  - 40-50 yd line: Single 20 only
`,
  }).returning();

  // Create profiles
  const [alex, jordan, casey, morgan] = await db.insert(profiles).values([
    { name: "Alex" },
    { name: "Jordan" },
    { name: "Casey" },
    { name: "Morgan" },
  ]).returning();

  console.log("Created profiles:", alex.name, jordan.name, casey.name, morgan.name);

  // Create a completed sample game
  const [game1] = await db.insert(games).values({
    player1Id: alex.id,
    player2Id: jordan.id,
    player1Score: 14,
    player2Score: 10,
    currentQuarter: 4,
    possession: 1,
    firstPossession: 1,
    status: "completed",
    winnerId: alex.id,
    rulesVersion: "0.9",
    completedAt: new Date(),
  }).returning();

  // Create drives
  const [drive1] = await db.insert(drives).values({
    gameId: game1.id,
    playerId: alex.id,
    quarter: 1,
    driveInQuarter: 1,
    sequenceInGame: 1,
    startPosition: 30,
    currentPosition: 100,
    endPosition: 100,
    startReason: "default_own_30",
    dartCount: 1,
    yardsGained: 70,
    result: "td",
    pointsScored: 7,
    endedAt: new Date(),
  }).returning();

  const [drive2] = await db.insert(drives).values({
    gameId: game1.id,
    playerId: jordan.id,
    quarter: 1,
    driveInQuarter: 1,
    sequenceInGame: 2,
    startPosition: 30,
    currentPosition: 55,
    endPosition: 55,
    startReason: "default_own_30",
    dartCount: 3,
    yardsGained: 25,
    result: "fg_make",
    pointsScored: 3,
    endedAt: new Date(),
  }).returning();

  // Create sample dart throws for analytics
  await db.insert(dartThrows).values([
    {
      gameId: game1.id,
      driveId: drive1.id,
      playerId: alex.id,
      throwIndex: 1,
      phase: "offense",
      hitType: "inner_bull",
      numberHit: 25,
      ring: "inner_bull",
      multiplier: 1,
      posBefore: 30,
      posAfter: 100,
      requiredDistanceBefore: 70,
      requiredDistanceAfter: 0,
      dartsRemainingBefore: 4,
      dartsRemainingAfter: 3,
      yardsAwarded: 70,
      pointsAwarded: 6,
      isTd: true,
      rulePath: "TD_INNER_BULL",
    },
    {
      gameId: game1.id,
      driveId: drive1.id,
      playerId: alex.id,
      throwIndex: 2,
      phase: "conversion_pat",
      hitType: "number",
      numberHit: 3,
      ring: "single_inner",
      multiplier: 1,
      posBefore: 100,
      posAfter: 100,
      dartsRemainingBefore: 1,
      dartsRemainingAfter: 0,
      yardsAwarded: 0,
      pointsAwarded: 1,
      isPatGood: true,
      rulePath: "PAT_GOOD",
    },
    {
      gameId: game1.id,
      driveId: drive2.id,
      playerId: jordan.id,
      throwIndex: 1,
      phase: "offense",
      hitType: "number",
      numberHit: 10,
      ring: "single_outer",
      multiplier: 1,
      posBefore: 30,
      posAfter: 40,
      requiredDistanceBefore: 70,
      requiredDistanceAfter: 60,
      dartsRemainingBefore: 4,
      dartsRemainingAfter: 3,
      yardsAwarded: 10,
      rulePath: "ADVANCE",
    },
    {
      gameId: game1.id,
      driveId: drive2.id,
      playerId: jordan.id,
      throwIndex: 2,
      phase: "offense",
      hitType: "number",
      numberHit: 15,
      ring: "single_inner",
      multiplier: 1,
      posBefore: 40,
      posAfter: 55,
      requiredDistanceBefore: 60,
      requiredDistanceAfter: 45,
      dartsRemainingBefore: 3,
      dartsRemainingAfter: 2,
      yardsAwarded: 15,
      rulePath: "ADVANCE",
    },
    {
      gameId: game1.id,
      driveId: drive2.id,
      playerId: jordan.id,
      throwIndex: 3,
      phase: "field_goal",
      hitType: "number",
      numberHit: 3,
      ring: "single_inner",
      multiplier: 1,
      posBefore: 55,
      posAfter: 55,
      dartsRemainingBefore: 2,
      dartsRemainingAfter: 1,
      yardsAwarded: 0,
      pointsAwarded: 3,
      isFgAttempt: true,
      isFgGood: true,
      rulePath: "FG_GOOD_30_39",
    },
  ]);

  // Create events for play-by-play
  await db.insert(events).values([
    {
      gameId: game1.id,
      driveId: drive1.id,
      playerId: alex.id,
      type: "game_start",
      data: { firstPossession: 1 },
      description: "Game started. Alex receives first.",
    },
    {
      gameId: game1.id,
      driveId: drive1.id,
      playerId: alex.id,
      type: "touchdown",
      data: { innerBull: true },
      description: "TOUCHDOWN! (Inner Bull)",
    },
    {
      gameId: game1.id,
      driveId: drive1.id,
      playerId: alex.id,
      type: "pat_attempt",
      data: { success: true, points: 1 },
      description: "PAT GOOD! +1",
    },
    {
      gameId: game1.id,
      driveId: drive2.id,
      playerId: jordan.id,
      type: "fg_attempt",
      data: { made: true },
      description: "FIELD GOAL GOOD!",
    },
    {
      gameId: game1.id,
      driveId: null,
      playerId: alex.id,
      type: "game_end",
      data: { player1Score: 14, player2Score: 10, winnerId: alex.id },
      description: "Game Over! Final: 14 - 10",
    },
  ]);

  console.log("Database seeded successfully!");
}

seed().catch(console.error).finally(() => process.exit());
