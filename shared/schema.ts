import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, smallint, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Profile - player identity without authentication
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  celebrationVideo: text("celebration_video"),
  sadVideo: text("sad_video"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const profilesRelations = relations(profiles, ({ many }) => ({
  gamesAsPlayer1: many(games, { relationName: "player1" }),
  gamesAsPlayer2: many(games, { relationName: "player2" }),
  drives: many(drives),
  dartThrows: many(dartThrows),
}));

export const insertProfileSchema = createInsertSchema(profiles).pick({
  name: true,
  celebrationVideo: true,
  sadVideo: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

// Rulesets - versioned rules for tracking which rules a game was played under
export const rulesets = pgTable("rulesets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: text("version").notNull().unique(),
  rulesMarkdown: text("rules_markdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRulesetSchema = createInsertSchema(rulesets).pick({
  version: true,
  rulesMarkdown: true,
});

export type InsertRuleset = z.infer<typeof insertRulesetSchema>;
export type Ruleset = typeof rulesets.$inferSelect;

// Game - a match between two players
export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  player1Id: varchar("player1_id").notNull(),
  player2Id: varchar("player2_id").notNull(),
  player1Score: integer("player1_score").default(0).notNull(),
  player2Score: integer("player2_score").default(0).notNull(),
  currentQuarter: integer("current_quarter").default(1).notNull(),
  possession: integer("possession").default(1).notNull(),
  firstPossession: integer("first_possession").default(1).notNull(),
  status: text("status").default("active").notNull(),
  winnerId: varchar("winner_id"),
  rulesVersion: text("rules_version").default("0.9").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const gamesRelations = relations(games, ({ one, many }) => ({
  player1: one(profiles, { fields: [games.player1Id], references: [profiles.id], relationName: "player1" }),
  player2: one(profiles, { fields: [games.player2Id], references: [profiles.id], relationName: "player2" }),
  drives: many(drives),
  events: many(events),
  dartThrows: many(dartThrows),
}));

export const insertGameSchema = createInsertSchema(games).pick({
  player1Id: true,
  player2Id: true,
  possession: true,
});

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

// Drive - a possession sequence
export const drives = pgTable("drives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull(),
  playerId: varchar("player_id").notNull(),
  quarter: integer("quarter").notNull(),
  driveInQuarter: integer("drive_in_quarter").default(1).notNull(),
  sequenceInGame: integer("sequence_in_game").default(1).notNull(),
  startPosition: integer("start_position").default(30).notNull(),
  currentPosition: integer("current_position").default(30).notNull(),
  endPosition: integer("end_position"),
  startReason: text("start_reason").default("default_own_30").notNull(),
  dartCount: integer("dart_count").default(0).notNull(),
  yardsGained: integer("yards_gained").default(0).notNull(),
  result: text("result"),
  pointsScored: integer("points_scored").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("drives_game_sequence_idx").on(table.gameId, table.sequenceInGame),
  index("drives_game_quarter_idx").on(table.gameId, table.quarter, table.driveInQuarter),
]);

export const drivesRelations = relations(drives, ({ one, many }) => ({
  game: one(games, { fields: [drives.gameId], references: [games.id] }),
  player: one(profiles, { fields: [drives.playerId], references: [profiles.id] }),
  events: many(events),
  dartThrows: many(dartThrows),
}));

export const insertDriveSchema = createInsertSchema(drives).pick({
  gameId: true,
  playerId: true,
  quarter: true,
  startPosition: true,
  startReason: true,
  driveInQuarter: true,
  sequenceInGame: true,
});

export type InsertDrive = z.infer<typeof insertDriveSchema>;
export type Drive = typeof drives.$inferSelect;

// Event - individual actions within a game (for play-by-play display)
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull(),
  driveId: varchar("drive_id"),
  playerId: varchar("player_id").notNull(),
  type: text("type").notNull(),
  data: jsonb("data"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const eventsRelations = relations(events, ({ one }) => ({
  game: one(games, { fields: [events.gameId], references: [games.id] }),
  drive: one(drives, { fields: [events.driveId], references: [drives.id] }),
  player: one(profiles, { fields: [events.playerId], references: [profiles.id] }),
}));

export const insertEventSchema = createInsertSchema(events).pick({
  gameId: true,
  driveId: true,
  playerId: true,
  type: true,
  data: true,
  description: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type GameEvent = typeof events.$inferSelect;

// Dart throws - detailed record of every dart for analytics and heat maps
export const dartThrows = pgTable("dart_throws", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull(),
  driveId: varchar("drive_id").notNull(),
  playerId: varchar("player_id").notNull(),
  throwIndex: smallint("throw_index").notNull(),
  phase: text("phase").notNull(),
  
  hitType: text("hit_type").notNull(),
  numberHit: smallint("number_hit"),
  ring: text("ring"),
  multiplier: smallint("multiplier"),
  
  posBefore: integer("pos_before").notNull(),
  posAfter: integer("pos_after").notNull(),
  requiredDistanceBefore: integer("required_distance_before"),
  requiredDistanceAfter: integer("required_distance_after"),
  dartsRemainingBefore: integer("darts_remaining_before").notNull(),
  dartsRemainingAfter: integer("darts_remaining_after").notNull(),
  
  yardsAwarded: integer("yards_awarded").default(0).notNull(),
  pointsAwarded: integer("points_awarded").default(0).notNull(),
  isBust: boolean("is_bust").default(false).notNull(),
  isTd: boolean("is_td").default(false).notNull(),
  isFgAttempt: boolean("is_fg_attempt").default(false).notNull(),
  isFgGood: boolean("is_fg_good"),
  isPatGood: boolean("is_pat_good"),
  isTwoGood: boolean("is_two_good"),
  isPunt: boolean("is_punt").default(false).notNull(),
  isPuntBlocked: boolean("is_punt_blocked").default(false).notNull(),
  puntNextStartPos: integer("punt_next_start_pos"),
  puntReturnYards: integer("punt_return_yards"),
  isPenalty: boolean("is_penalty").default(false).notNull(),
  isSafety: boolean("is_safety").default(false).notNull(),
  isInterception: boolean("is_interception").default(false).notNull(),
  
  rulePath: text("rule_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("dart_throws_drive_idx").on(table.driveId, table.throwIndex),
  index("dart_throws_player_date_idx").on(table.playerId, table.createdAt),
  index("dart_throws_game_date_idx").on(table.gameId, table.createdAt),
  index("dart_throws_heat_map_idx").on(table.playerId, table.numberHit, table.ring),
]);

export const dartThrowsRelations = relations(dartThrows, ({ one }) => ({
  game: one(games, { fields: [dartThrows.gameId], references: [games.id] }),
  drive: one(drives, { fields: [dartThrows.driveId], references: [drives.id] }),
  player: one(profiles, { fields: [dartThrows.playerId], references: [profiles.id] }),
}));

export const insertDartThrowSchema = createInsertSchema(dartThrows).omit({
  id: true,
  createdAt: true,
});

export type InsertDartThrow = z.infer<typeof insertDartThrowSchema>;
export type DartThrowRecord = typeof dartThrows.$inferSelect;

// Dart throw data structure (for frontend/engine use)
export const dartThrowSchema = z.object({
  segment: z.number().min(0).max(25),
  multiplier: z.enum(["single_inner", "single_outer", "double", "triple", "inner_bull", "outer_bull", "miss"]),
  yards: z.number(),
});

export type DartThrow = z.infer<typeof dartThrowSchema>;

// Game state for frontend
export interface GameState {
  game: Game;
  currentDrive: Drive | null;
  events: GameEvent[];
  player1: Profile;
  player2: Profile;
  availableActions: AvailableActions;
  awaitingConversion: boolean;
  conversionType: "pat" | "two_point" | null;
  awaitingBonusDart: boolean;
}

export interface AvailableActions {
  canThrowDart: boolean;
  canAttemptFG: boolean;
  canPunt: boolean;
  canChooseConversion: boolean;
  canUseBonusDart: boolean;
}

// Stats computed for profiles
export interface ProfileStats {
  games: number;
  wins: number;
  losses: number;
  winPercentage: number;
  totalPoints: number;
  pointsPerGame: number;
  drives: number;
  pointsPerDrive: number;
  totalYards: number;
  yardsPerGame: number;
  totalDarts: number;
  yardsPerDart: number;
  touchdowns: number;
  innerBullTDs: number;
  fgAttempts: number;
  fgMakes: number;
  fgPercentage: number;
  patAttempts: number;
  patMakes: number;
  patPercentage: number;
  twoPtAttempts: number;
  twoPtMakes: number;
  twoPtPercentage: number;
}

export interface HeadToHead {
  opponentId: string;
  opponentName: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
}

// Heat map data for dartboard visualization
export interface HeatMapData {
  segment: number;
  ring: string;
  count: number;
  percentage: number;
}

export interface HeatMapFilters {
  profileId: string;
  gameId?: string;
  opponentId?: string;
  phase?: string;
  dateFrom?: Date;
  dateTo?: Date;
}
