import { db } from "./db";
import { games, drives, dartThrows, profiles } from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";

// Configuration constants
const WEIGHTS = {
  AVG_MARGIN: 0.45,
  POINTS_PER_DART: 0.25,
  FG_MAKE_RATE: 0.15,
  MISS_RATE: -0.10,
  BUST_RATE: -0.05,
};

const RECENT_WEIGHT = 0.70; // 70% weight on last 10 games
const ALLTIME_WEIGHT = 0.30; // 30% weight on all-time
const RECENT_GAMES_COUNT = 10;

const SHRINKAGE_PRIOR = 8; // Games needed for full weight
const MARGIN_SCALE = 1.75; // Convert power diff to expected margin
const LOGISTIC_K = 6.0; // Steepness of win probability curve
const FIRST_POSSESSION_DISADVANTAGE = 2.95; // Points disadvantage for going first

export interface ProfileMetrics {
  profileId: string;
  profileName: string;
  gamesPlayed: number;
  avgMargin: number;
  pointsPerDart: number;
  avgPointsPerDrive: number;
  fgMakeRate: number;
  missRate: number;
  bustRate: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
}

export interface MatchupLine {
  spread: number;
  spreadDisplay: string;
  moneylineA: number;
  moneylineB: number;
  total: number;
  expectedMargin: number;
  pA: number;
  pB: number;
  debug: {
    powerA: number;
    powerB: number;
    metricsA: ProfileMetrics;
    metricsB: ProfileMetrics;
    zScoresA: Record<string, number>;
    zScoresB: Record<string, number>;
  };
}

// Get all completed games for a profile, ordered by date (most recent first)
async function getProfileGames(profileId: string) {
  return db.select()
    .from(games)
    .where(
      and(
        eq(games.status, "completed"),
        or(eq(games.player1Id, profileId), eq(games.player2Id, profileId))
      )
    )
    .orderBy(desc(games.completedAt));
}

// Calculate metrics for a profile with 70/30 weighting
async function calculateProfileMetrics(profileId: string): Promise<ProfileMetrics> {
  const profile = await db.select().from(profiles).where(eq(profiles.id, profileId));
  const profileName = profile[0]?.name || "Unknown";
  
  const allGames = await getProfileGames(profileId);
  const recentGames = allGames.slice(0, RECENT_GAMES_COUNT);
  
  if (allGames.length === 0) {
    return {
      profileId,
      profileName,
      gamesPlayed: 0,
      avgMargin: 0,
      pointsPerDart: 0,
      avgPointsPerDrive: 0,
      fgMakeRate: 0,
      missRate: 0,
      bustRate: 0,
      avgPointsFor: 0,
      avgPointsAgainst: 0,
    };
  }

  // Calculate margin stats
  const calcMarginStats = (gamesList: typeof allGames) => {
    let totalMargin = 0;
    let totalPointsFor = 0;
    let totalPointsAgainst = 0;
    
    for (const game of gamesList) {
      const isPlayer1 = game.player1Id === profileId;
      const pointsFor = isPlayer1 ? game.player1Score : game.player2Score;
      const pointsAgainst = isPlayer1 ? game.player2Score : game.player1Score;
      totalMargin += pointsFor - pointsAgainst;
      totalPointsFor += pointsFor;
      totalPointsAgainst += pointsAgainst;
    }
    
    return {
      avgMargin: gamesList.length > 0 ? totalMargin / gamesList.length : 0,
      avgPointsFor: gamesList.length > 0 ? totalPointsFor / gamesList.length : 0,
      avgPointsAgainst: gamesList.length > 0 ? totalPointsAgainst / gamesList.length : 0,
    };
  };

  const allTimeMargin = calcMarginStats(allGames);
  const recentMargin = calcMarginStats(recentGames);

  // Get dart throw stats
  const allGameIds = allGames.map(g => g.id);
  const recentGameIds = recentGames.map(g => g.id);

  const calcDartStats = async (gameIds: string[]) => {
    if (gameIds.length === 0) {
      return { totalDarts: 0, totalPoints: 0, misses: 0, busts: 0 };
    }
    
    const result = await db.select({
      totalDarts: sql<number>`count(*) filter (where ${dartThrows.phase} = 'offense')`,
      totalPoints: sql<number>`coalesce(sum(${dartThrows.pointsAwarded}), 0)`,
      misses: sql<number>`count(*) filter (where ${dartThrows.hitType} = 'miss' and ${dartThrows.phase} = 'offense')`,
      busts: sql<number>`count(*) filter (where ${dartThrows.isBust} = true)`,
    })
    .from(dartThrows)
    .where(
      and(
        eq(dartThrows.playerId, profileId),
        sql`${dartThrows.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`
      )
    );
    
    return {
      totalDarts: Number(result[0]?.totalDarts) || 0,
      totalPoints: Number(result[0]?.totalPoints) || 0,
      misses: Number(result[0]?.misses) || 0,
      busts: Number(result[0]?.busts) || 0,
    };
  };

  // Get drive stats
  const calcDriveStats = async (gameIds: string[]) => {
    if (gameIds.length === 0) {
      return { totalDrives: 0, totalPoints: 0 };
    }
    
    const result = await db.select({
      totalDrives: sql<number>`count(*)`,
      totalPoints: sql<number>`coalesce(sum(${drives.pointsScored}), 0)`,
    })
    .from(drives)
    .where(
      and(
        eq(drives.playerId, profileId),
        sql`${drives.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`
      )
    );
    
    return {
      totalDrives: Number(result[0]?.totalDrives) || 0,
      totalPoints: Number(result[0]?.totalPoints) || 0,
    };
  };

  // Get FG stats
  const calcFGStats = async (gameIds: string[]) => {
    if (gameIds.length === 0) {
      return { fgAttempts: 0, fgMakes: 0 };
    }
    
    const result = await db.select({
      fgAttempts: sql<number>`count(*) filter (where ${dartThrows.isFgAttempt} = true)`,
      fgMakes: sql<number>`count(*) filter (where ${dartThrows.isFgGood} = true)`,
    })
    .from(dartThrows)
    .where(
      and(
        eq(dartThrows.playerId, profileId),
        sql`${dartThrows.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`
      )
    );
    
    return {
      fgAttempts: Number(result[0]?.fgAttempts) || 0,
      fgMakes: Number(result[0]?.fgMakes) || 0,
    };
  };

  const [allTimeDarts, recentDarts] = await Promise.all([
    calcDartStats(allGameIds),
    calcDartStats(recentGameIds),
  ]);

  const [allTimeDrives, recentDrives] = await Promise.all([
    calcDriveStats(allGameIds),
    calcDriveStats(recentGameIds),
  ]);

  const [allTimeFG, recentFG] = await Promise.all([
    calcFGStats(allGameIds),
    calcFGStats(recentGameIds),
  ]);

  // Calculate weighted averages
  const weightedAvg = (recent: number, allTime: number) => {
    if (recentGames.length === 0) return allTime;
    if (recentGames.length >= RECENT_GAMES_COUNT) {
      return RECENT_WEIGHT * recent + ALLTIME_WEIGHT * allTime;
    }
    // Scale recent weight based on how many recent games we have
    const recentScale = recentGames.length / RECENT_GAMES_COUNT;
    const adjustedRecentWeight = RECENT_WEIGHT * recentScale;
    const adjustedAllTimeWeight = 1 - adjustedRecentWeight;
    return adjustedRecentWeight * recent + adjustedAllTimeWeight * allTime;
  };

  const allTimePPD = allTimeDarts.totalDarts > 0 
    ? allTimeDarts.totalPoints / allTimeDarts.totalDarts : 0;
  const recentPPD = recentDarts.totalDarts > 0 
    ? recentDarts.totalPoints / recentDarts.totalDarts : 0;

  const allTimePPDrive = allTimeDrives.totalDrives > 0 
    ? allTimeDrives.totalPoints / allTimeDrives.totalDrives : 0;
  const recentPPDrive = recentDrives.totalDrives > 0 
    ? recentDrives.totalPoints / recentDrives.totalDrives : 0;

  const allTimeFGRate = allTimeFG.fgAttempts > 0 
    ? allTimeFG.fgMakes / allTimeFG.fgAttempts : 0;
  const recentFGRate = recentFG.fgAttempts > 0 
    ? recentFG.fgMakes / recentFG.fgAttempts : 0;

  const allTimeMissRate = allTimeDarts.totalDarts > 0 
    ? allTimeDarts.misses / allTimeDarts.totalDarts : 0;
  const recentMissRate = recentDarts.totalDarts > 0 
    ? recentDarts.misses / recentDarts.totalDarts : 0;

  const allTimeBustRate = allTimeDarts.totalDarts > 0 
    ? allTimeDarts.busts / allTimeDarts.totalDarts : 0;
  const recentBustRate = recentDarts.totalDarts > 0 
    ? recentDarts.busts / recentDarts.totalDarts : 0;

  return {
    profileId,
    profileName,
    gamesPlayed: allGames.length,
    avgMargin: weightedAvg(recentMargin.avgMargin, allTimeMargin.avgMargin),
    pointsPerDart: weightedAvg(recentPPD, allTimePPD),
    avgPointsPerDrive: weightedAvg(recentPPDrive, allTimePPDrive),
    fgMakeRate: weightedAvg(recentFGRate, allTimeFGRate),
    missRate: weightedAvg(recentMissRate, allTimeMissRate),
    bustRate: weightedAvg(recentBustRate, allTimeBustRate),
    avgPointsFor: weightedAvg(recentMargin.avgPointsFor, allTimeMargin.avgPointsFor),
    avgPointsAgainst: weightedAvg(recentMargin.avgPointsAgainst, allTimeMargin.avgPointsAgainst),
  };
}

// Get all profiles' metrics for Z-score calculation
async function getAllProfileMetrics(): Promise<ProfileMetrics[]> {
  const allProfiles = await db.select().from(profiles);
  const metricsPromises = allProfiles.map(p => calculateProfileMetrics(p.id));
  return Promise.all(metricsPromises);
}

// Calculate Z-scores for a metric across all profiles
function calculateZScores(
  allMetrics: ProfileMetrics[],
  getValue: (m: ProfileMetrics) => number
): Map<string, number> {
  const values = allMetrics.map(getValue).filter(v => !isNaN(v) && isFinite(v));
  
  if (values.length === 0) {
    return new Map(allMetrics.map(m => [m.profileId, 0]));
  }
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  
  return new Map(allMetrics.map(m => {
    const value = getValue(m);
    if (std === 0 || isNaN(value) || !isFinite(value)) {
      return [m.profileId, 0];
    }
    return [m.profileId, (value - mean) / std];
  }));
}

// Calculate power rating with shrinkage
function calculatePowerRating(
  zScores: Record<string, number>,
  gamesPlayed: number
): number {
  const powerRaw = 
    WEIGHTS.AVG_MARGIN * (zScores.avgMargin || 0) +
    WEIGHTS.POINTS_PER_DART * (zScores.pointsPerDart || 0) +
    WEIGHTS.FG_MAKE_RATE * (zScores.fgMakeRate || 0) +
    WEIGHTS.MISS_RATE * (zScores.missRate || 0) +
    WEIGHTS.BUST_RATE * (zScores.bustRate || 0);

  // Apply shrinkage toward 0 (league average)
  const w = gamesPlayed / (gamesPlayed + SHRINKAGE_PRIOR);
  return w * powerRaw;
}

// Convert win probability to American moneyline
function probToAmerican(p: number): number {
  if (p >= 0.5) {
    return -Math.round((p / (1 - p)) * 100);
  } else {
    return Math.round(((1 - p) / p) * 100);
  }
}

// Main function to get matchup line
export async function getMatchupLine(
  profileAId: string,
  profileBId: string,
  firstPossessionId: string
): Promise<MatchupLine> {
  // Get all profile metrics for Z-score calculation
  const allMetrics = await getAllProfileMetrics();
  
  const metricsA = allMetrics.find(m => m.profileId === profileAId);
  const metricsB = allMetrics.find(m => m.profileId === profileBId);
  
  if (!metricsA || !metricsB) {
    throw new Error("Profile not found");
  }

  // Calculate Z-scores for each metric
  const zAvgMargin = calculateZScores(allMetrics, m => m.avgMargin);
  const zPointsPerDart = calculateZScores(allMetrics, m => m.pointsPerDart);
  const zFgMakeRate = calculateZScores(allMetrics, m => m.fgMakeRate);
  const zMissRate = calculateZScores(allMetrics, m => m.missRate);
  const zBustRate = calculateZScores(allMetrics, m => m.bustRate);

  const zScoresA: Record<string, number> = {
    avgMargin: zAvgMargin.get(profileAId) || 0,
    pointsPerDart: zPointsPerDart.get(profileAId) || 0,
    fgMakeRate: zFgMakeRate.get(profileAId) || 0,
    missRate: zMissRate.get(profileAId) || 0,
    bustRate: zBustRate.get(profileAId) || 0,
  };

  const zScoresB: Record<string, number> = {
    avgMargin: zAvgMargin.get(profileBId) || 0,
    pointsPerDart: zPointsPerDart.get(profileBId) || 0,
    fgMakeRate: zFgMakeRate.get(profileBId) || 0,
    missRate: zMissRate.get(profileBId) || 0,
    bustRate: zBustRate.get(profileBId) || 0,
  };

  // Calculate power ratings
  const powerA = calculatePowerRating(zScoresA, metricsA.gamesPlayed);
  const powerB = calculatePowerRating(zScoresB, metricsB.gamesPlayed);

  // Calculate expected margin (A's perspective)
  let expectedMargin = (powerA - powerB) * MARGIN_SCALE;
  
  // Apply first possession adjustment
  // First possession has a disadvantage, so if A goes first, reduce their expected margin
  if (firstPossessionId === profileAId) {
    expectedMargin -= FIRST_POSSESSION_DISADVANTAGE;
  } else if (firstPossessionId === profileBId) {
    expectedMargin += FIRST_POSSESSION_DISADVANTAGE;
  }

  // Round to half-point spread
  const spread = Math.round(expectedMargin * 2) / 2;

  // Format spread display
  // Expected margin is from A's perspective: positive = A favored, negative = B favored
  let spreadDisplay: string;
  if (spread > 0) {
    // A is favored by spread points
    spreadDisplay = `${metricsA.profileName} -${spread}`;
  } else if (spread < 0) {
    // B is favored by |spread| points
    spreadDisplay = `${metricsB.profileName} ${spread}`;
  } else {
    spreadDisplay = "PICK";
  }

  // Calculate win probability using logistic curve
  let pA = 1 / (1 + Math.exp(-expectedMargin / LOGISTIC_K));
  pA = Math.min(Math.max(pA, 0.02), 0.98); // Clamp to avoid infinite odds
  const pB = 1 - pA;

  // Convert to American moneylines
  const moneylineA = probToAmerican(pA);
  const moneylineB = probToAmerican(pB);

  // Calculate total (O/U)
  const totalRaw = ((metricsA.avgPointsFor + metricsB.avgPointsAgainst) + 
                   (metricsB.avgPointsFor + metricsA.avgPointsAgainst)) / 2;
  const total = Math.round(totalRaw * 2) / 2;

  return {
    spread,
    spreadDisplay,
    moneylineA,
    moneylineB,
    total,
    expectedMargin,
    pA,
    pB,
    debug: {
      powerA,
      powerB,
      metricsA,
      metricsB,
      zScoresA,
      zScoresB,
    },
  };
}

// Get profile metrics (exported for API use)
export { calculateProfileMetrics };
