// server/storage.ts
import {
  type Profile,
  type InsertProfile,
  type Game,
  type InsertGame,
  type Drive,
  type InsertDrive,
  type GameEvent,
  type InsertEvent,
  type ProfileStats,
  type HeadToHead,
  type DartThrowRecord,
  type InsertDartThrow,
  type HeatMapData,
  type HeatMapFilters,
  profiles,
  games,
  drives,
  events,
  dartThrows,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, isNull, sql, gte, lte, count } from "drizzle-orm";

export interface IStorage {
  // Profiles
  getProfiles(): Promise<Profile[]>;
  getProfile(id: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(id: string, data: Partial<InsertProfile>): Promise<Profile | undefined>;
  deleteProfile(id: string): Promise<boolean>;
  getProfileStats(id: string): Promise<ProfileStats>;
  getProfileHeadToHead(id: string): Promise<HeadToHead[]>;
  getProfileGames(id: string): Promise<Game[]>;

  // Games
  getGames(): Promise<Game[]>;
  getGame(id: string): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, data: Partial<Game>): Promise<Game | undefined>;

  // Drives
  getDrives(gameId: string): Promise<Drive[]>;
  getDrive(id: string): Promise<Drive | undefined>;
  createDrive(drive: InsertDrive): Promise<Drive>;
  updateDrive(id: string, data: Partial<Drive>): Promise<Drive | undefined>;
  getCurrentDrive(gameId: string): Promise<Drive | undefined>;
  getDriveCount(gameId: string): Promise<number>;

  // Events
  getEvents(gameId: string): Promise<GameEvent[]>;
  createEvent(event: InsertEvent): Promise<GameEvent>;
  deleteLastEvent(gameId: string): Promise<boolean>;

  // Dart Throws
  createDartThrow(dartThrow: InsertDartThrow): Promise<DartThrowRecord>;

  // Canonical atomic dart write + projection
  recordDartAndProject(args: {
    driveId: string;
    dartThrow: InsertDartThrow;
    event: InsertEvent;
  }): Promise<Drive | undefined>;

  getDartThrows(driveId: string): Promise<DartThrowRecord[]>;
  getHeatMapData(filters: HeatMapFilters): Promise<HeatMapData[]>;
  deleteLastDartThrow(driveId: string): Promise<boolean>;

  // Undo Last Dart for Game
  undoLastDart(gameId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Profile methods
  async getProfiles(): Promise<Profile[]> {
    return db.select().from(profiles).orderBy(profiles.name);
  }

  async getProfile(id: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    return profile || undefined;
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [newProfile] = await db.insert(profiles).values(profile).returning();
    return newProfile;
  }

  async updateProfile(id: string, data: Partial<InsertProfile>): Promise<Profile | undefined> {
    const [updated] = await db.update(profiles).set(data).where(eq(profiles.id, id)).returning();
    return updated || undefined;
  }

  async deleteProfile(id: string): Promise<boolean> {
    const result = await db.delete(profiles).where(eq(profiles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getProfileStats(id: string): Promise<ProfileStats> {
    const playerGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "completed"), or(eq(games.player1Id, id), eq(games.player2Id, id))));

    const wins = playerGames.filter((g) => g.winnerId === id).length;
    const losses = playerGames.length - wins;

    let totalPoints = 0;
    playerGames.forEach((g) => {
      totalPoints += g.player1Id === id ? g.player1Score : g.player2Score;
    });

    const playerDrives = await db.select().from(drives).where(eq(drives.playerId, id));

    const throwStats = await db
      .select({
        totalDarts: sql<number>`count(*) filter (where ${dartThrows.phase} = 'offense')`,
        totalYards: sql<number>`coalesce(sum(${dartThrows.yardsAwarded}) filter (where ${dartThrows.phase} = 'offense'), 0)`,
        touchdowns: sql<number>`count(*) filter (where ${dartThrows.isTd} = true)`,
        innerBullTDs: sql<number>`count(*) filter (where ${dartThrows.isTd} = true and ${dartThrows.hitType} = 'inner_bull')`,
        fgAttempts: sql<number>`count(*) filter (where ${dartThrows.isFgAttempt} = true)`,
        fgMakes: sql<number>`count(*) filter (where ${dartThrows.isFgGood} = true)`,
        patAttempts: sql<number>`count(*) filter (where ${dartThrows.phase} = 'conversion_pat')`,
        patMakes: sql<number>`count(*) filter (where ${dartThrows.isPatGood} = true)`,
        twoPtAttempts: sql<number>`count(*) filter (where ${dartThrows.phase} = 'conversion_two')`,
        twoPtMakes: sql<number>`count(*) filter (where ${dartThrows.isTwoGood} = true)`,
      })
      .from(dartThrows)
      .where(eq(dartThrows.playerId, id));

    const stats = throwStats[0] || ({} as any);
    const totalDarts = Number(stats.totalDarts) || 0;
    const totalYards = Number(stats.totalYards) || 0;
    const touchdowns = Number(stats.touchdowns) || 0;
    const innerBullTDs = Number(stats.innerBullTDs) || 0;
    const fgAttempts = Number(stats.fgAttempts) || 0;
    const fgMakes = Number(stats.fgMakes) || 0;
    const patAttempts = Number(stats.patAttempts) || 0;
    const patMakes = Number(stats.patMakes) || 0;
    const twoPtAttempts = Number(stats.twoPtAttempts) || 0;
    const twoPtMakes = Number(stats.twoPtMakes) || 0;

    return {
      games: playerGames.length,
      wins,
      losses,
      winPercentage: playerGames.length > 0 ? (wins / playerGames.length) * 100 : 0,
      totalPoints,
      pointsPerGame: playerGames.length > 0 ? totalPoints / playerGames.length : 0,
      drives: playerDrives.length,
      pointsPerDrive: playerDrives.length > 0 ? totalPoints / playerDrives.length : 0,
      totalYards,
      yardsPerGame: playerGames.length > 0 ? totalYards / playerGames.length : 0,
      totalDarts,
      yardsPerDart: totalDarts > 0 ? totalYards / totalDarts : 0,
      touchdowns,
      innerBullTDs,
      fgAttempts,
      fgMakes,
      fgPercentage: fgAttempts > 0 ? (fgMakes / fgAttempts) * 100 : 0,
      patAttempts,
      patMakes,
      patPercentage: patAttempts > 0 ? (patMakes / patAttempts) * 100 : 0,
      twoPtAttempts,
      twoPtMakes,
      twoPtPercentage: twoPtAttempts > 0 ? (twoPtMakes / twoPtAttempts) * 100 : 0,
    };
  }

  async getProfileHeadToHead(id: string): Promise<HeadToHead[]> {
    const playerGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "completed"), or(eq(games.player1Id, id), eq(games.player2Id, id))));

    const h2hMap = new Map<
      string,
      { wins: number; losses: number; games: number; pointsFor: number; pointsAgainst: number }
    >();

    playerGames.forEach((g) => {
      const isPlayer1 = g.player1Id === id;
      const opponentId = isPlayer1 ? g.player2Id : g.player1Id;
      const pointsFor = isPlayer1 ? g.player1Score : g.player2Score;
      const pointsAgainst = isPlayer1 ? g.player2Score : g.player1Score;

      const current = h2hMap.get(opponentId) || {
        wins: 0,
        losses: 0,
        games: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };

      current.games++;
      current.pointsFor += pointsFor;
      current.pointsAgainst += pointsAgainst;

      if (g.winnerId === id) current.wins++;
      else current.losses++;

      h2hMap.set(opponentId, current);
    });

    const results: HeadToHead[] = [];
    for (const [opponentId, record] of h2hMap) {
      const opponent = await this.getProfile(opponentId);
      results.push({
        opponentId,
        opponentName: opponent?.name ?? "Unknown",
        wins: record.wins,
        losses: record.losses,
        gamesPlayed: record.games,
        pointsFor: record.pointsFor,
        pointsAgainst: record.pointsAgainst,
      });
    }

    return results;
  }

  async getProfileGames(id: string): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(or(eq(games.player1Id, id), eq(games.player2Id, id)))
      .orderBy(desc(games.createdAt));
  }

  // Game methods
  async getGames(): Promise<Game[]> {
    return db.select().from(games).orderBy(desc(games.createdAt));
  }

  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game || undefined;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const possession = game.possession ?? 1;
    const [newGame] = await db
      .insert(games)
      .values({
        player1Id: game.player1Id,
        player2Id: game.player2Id,
        possession,
        firstPossession: possession,
      })
      .returning();
    return newGame;
  }

  async updateGame(id: string, data: Partial<Game>): Promise<Game | undefined> {
    const [updated] = await db.update(games).set(data).where(eq(games.id, id)).returning();
    return updated || undefined;
  }

  // Drive methods
  async getDrives(gameId: string): Promise<Drive[]> {
    return db.select().from(drives).where(eq(drives.gameId, gameId)).orderBy(drives.sequenceInGame);
  }

  async getDrive(id: string): Promise<Drive | undefined> {
    const [drive] = await db.select().from(drives).where(eq(drives.id, id));
    return drive || undefined;
  }

  async createDrive(drive: InsertDrive): Promise<Drive> {
    const [newDrive] = await db
      .insert(drives)
      .values({
        gameId: drive.gameId,
        playerId: drive.playerId,
        quarter: drive.quarter,
        startPosition: drive.startPosition ?? 30,
        currentPosition: drive.startPosition ?? 30,
        startReason: drive.startReason ?? "default_own_30",
        driveInQuarter: drive.driveInQuarter ?? 1,
        sequenceInGame: drive.sequenceInGame ?? 1,
      })
      .returning();
    return newDrive;
  }

  async updateDrive(id: string, data: Partial<Drive>): Promise<Drive | undefined> {
    const [updated] = await db.update(drives).set(data).where(eq(drives.id, id)).returning();
    return updated || undefined;
  }

  async getCurrentDrive(gameId: string): Promise<Drive | undefined> {
    const [drive] = await db
      .select()
      .from(drives)
      .where(and(eq(drives.gameId, gameId), isNull(drives.result)))
      .orderBy(desc(drives.createdAt))
      .limit(1);
    return drive || undefined;
  }

  async getDriveCount(gameId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(drives).where(eq(drives.gameId, gameId));
    return result[0]?.count ?? 0;
  }

  // Event methods
  async getEvents(gameId: string): Promise<GameEvent[]> {
    return db.select().from(events).where(eq(events.gameId, gameId)).orderBy(events.createdAt);
  }

  async createEvent(event: InsertEvent): Promise<GameEvent> {
    const [newEvent] = await db
      .insert(events)
      .values({
        gameId: event.gameId,
        driveId: event.driveId ?? null,
        playerId: event.playerId,
        type: event.type,
        data: event.data ?? null,
        description: event.description,
      })
      .returning();
    return newEvent;
  }

  async deleteLastEvent(gameId: string): Promise<boolean> {
    const lastEvents = await db
      .select()
      .from(events)
      .where(eq(events.gameId, gameId))
      .orderBy(desc(events.createdAt))
      .limit(1);

    if (lastEvents.length === 0) return false;

    const result = await db.delete(events).where(eq(events.id, lastEvents[0].id));
    return (result.rowCount ?? 0) > 0;
  }

  // Dart Throw methods
  async createDartThrow(dartThrow: InsertDartThrow): Promise<DartThrowRecord> {
    const [newThrow] = await db.insert(dartThrows).values(dartThrow).returning();
    return newThrow;
  }

  // ✅ NEW: atomic write + projection
  async recordDartAndProject(args: {
    driveId: string;
    dartThrow: InsertDartThrow;
    event: InsertEvent;
  }): Promise<Drive | undefined> {
    const { driveId, dartThrow, event } = args;

    return db.transaction(async (tx) => {
      // 1) Insert dart throw
      await tx.insert(dartThrows).values(dartThrow);

      // 2) Insert event
      await tx.insert(events).values({
        gameId: event.gameId,
        driveId: event.driveId ?? null,
        playerId: event.playerId,
        type: event.type,
        data: event.data ?? null,
        description: event.description,
      });

      // 3) Recompute projection from throws (source of truth)
      const throwsForDrive = await tx
        .select({
          posAfter: dartThrows.posAfter,
          yardsAwarded: dartThrows.yardsAwarded,
        })
        .from(dartThrows)
        .where(eq(dartThrows.driveId, driveId))
        .orderBy(dartThrows.throwIndex);

      const dartCount = throwsForDrive.length;
      const yardsGained = throwsForDrive.reduce((sum, t) => sum + (t.yardsAwarded ?? 0), 0);
      const last = throwsForDrive[throwsForDrive.length - 1];
      const currentPosition = last?.posAfter;

      const [updated] = await tx
        .update(drives)
        .set({
          dartCount,
          yardsGained,
          ...(currentPosition !== undefined ? { currentPosition } : {}),
          endPosition: null, // keep drive "open" unless ended elsewhere
        })
        .where(eq(drives.id, driveId))
        .returning();

      return updated || undefined;
    });
  }

  async getDartThrows(driveId: string): Promise<DartThrowRecord[]> {
    return db.select().from(dartThrows).where(eq(dartThrows.driveId, driveId)).orderBy(dartThrows.throwIndex);
  }

  async getHeatMapData(filters: HeatMapFilters): Promise<HeatMapData[]> {
    const conditions = [eq(dartThrows.playerId, filters.profileId)];

    if (filters.gameId) {
      conditions.push(eq(dartThrows.gameId, filters.gameId));
    }
    if (filters.phase) {
      conditions.push(eq(dartThrows.phase, filters.phase));
    }
    if (filters.dateFrom) {
      conditions.push(gte(dartThrows.createdAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(dartThrows.createdAt, filters.dateTo));
    }

    if (filters.opponentId) {
      const opponentGames = await db
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            or(eq(games.player1Id, filters.opponentId), eq(games.player2Id, filters.opponentId)),
            or(eq(games.player1Id, filters.profileId), eq(games.player2Id, filters.profileId))
          )
        );

      const gameIds = opponentGames.map((g) => g.id);
      if (gameIds.length > 0) {
        conditions.push(sql`${dartThrows.gameId} = ANY(${gameIds})`);
      }
    }

    const results = await db
      .select({
        numberHit: dartThrows.numberHit,
        ring: dartThrows.ring,
        count: sql<number>`count(*)::int`,
      })
      .from(dartThrows)
      .where(and(...conditions))
      .groupBy(dartThrows.numberHit, dartThrows.ring);

    const totalThrows = results.reduce((sum, r) => sum + r.count, 0);

    return results.map((r) => ({
      segment: r.numberHit ?? 0,
      ring: r.ring ?? "miss",
      count: r.count,
      percentage: totalThrows > 0 ? (r.count / totalThrows) * 100 : 0,
    }));
  }

  async deleteLastDartThrow(driveId: string): Promise<boolean> {
    const lastThrows = await db
      .select()
      .from(dartThrows)
      .where(eq(dartThrows.driveId, driveId))
      .orderBy(desc(dartThrows.throwIndex))
      .limit(1);

    if (lastThrows.length === 0) return false;

    const result = await db.delete(dartThrows).where(eq(dartThrows.id, lastThrows[0].id));
    return (result.rowCount ?? 0) > 0;
  }

  async undoLastDart(gameId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      // 1) Find last dart event
      const lastEvent = await tx
        .select()
        .from(events)
        .where(and(eq(events.gameId, gameId), eq(events.type, "dart")))
        .orderBy(desc(events.createdAt))
        .limit(1);

      if (lastEvent.length === 0) return false;

      const event = lastEvent[0];
      const driveId = event.driveId;

      // Guard
      if (!driveId) {
        await tx.delete(events).where(eq(events.id, event.id));
        return true;
      }

      // 2) Delete last dart throw for that drive
      const lastThrow = await tx
        .select()
        .from(dartThrows)
        .where(eq(dartThrows.driveId, driveId))
        .orderBy(desc(dartThrows.throwIndex))
        .limit(1);

      if (lastThrow.length > 0) {
        await tx.delete(dartThrows).where(eq(dartThrows.id, lastThrow[0].id));
      }

      // 3) Delete the event itself
      await tx.delete(events).where(eq(events.id, event.id));

      // 4) Rebuild drive projection from remaining throws
      const [drive] = await tx.select().from(drives).where(eq(drives.id, driveId)).limit(1);
      if (!drive) return true;

      const remainingLast = await tx
        .select()
        .from(dartThrows)
        .where(eq(dartThrows.driveId, driveId))
        .orderBy(desc(dartThrows.throwIndex))
        .limit(1);

      if (remainingLast.length === 0) {
        // No throws left -> reset to drive start
        await tx
          .update(drives)
          .set({
            dartCount: 0,
            currentPosition: drive.startPosition,
            yardsGained: 0,
            endPosition: null,
          })
          .where(eq(drives.id, driveId));

        return true;
      }

      const lastRemainingThrow = remainingLast[0];

      const newCurrentPosition = lastRemainingThrow.posAfter;
      const newDartCount = lastRemainingThrow.throwIndex; // existing behavior
      const newYardsGained = newCurrentPosition - drive.startPosition;

      await tx
        .update(drives)
        .set({
          dartCount: newDartCount,
          currentPosition: newCurrentPosition,
          yardsGained: newYardsGained,
          endPosition: null,
        })
        .where(eq(drives.id, driveId));

      return true;
    });
  }
}

export const storage = new DatabaseStorage();
