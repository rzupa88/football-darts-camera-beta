import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History as HistoryIcon, Trophy, Calendar, Play, Target, Goal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Profile, Game } from "@shared/schema";
import { useState } from "react";

export default function History() {
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { data: profiles } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });

  const completedGames = games?.filter((g) => g.status === "completed") ?? [];
  const activeGames = games?.filter((g) => g.status === "active" || g.status === "overtime") ?? [];

  let filteredGames = completedGames;
  
  if (filterPlayer !== "all") {
    filteredGames = filteredGames.filter(
      (g) => g.player1Id === filterPlayer || g.player2Id === filterPlayer
    );
  }

  const getProfile = (id: string) => profiles?.find((p) => p.id === id);

  const totalGamesCount = completedGames.length + activeGames.length;
  
  const calculateStats = (games: Game[]) => {
    const totalPoints = games.reduce((sum, g) => sum + g.player1Score + g.player2Score, 0);
    return {
      totalGames: games.length,
      avgPointsPerGame: games.length > 0 ? (totalPoints / games.length).toFixed(1) : "0.0",
    };
  };

  const overallStats = calculateStats(completedGames);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Game History</h1>
          <p className="text-muted-foreground mt-1">
            {totalGamesCount} total games | {overallStats.avgPointsPerGame} avg pts/game
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={filterPlayer} onValueChange={setFilterPlayer}>
            <SelectTrigger className="w-40" data-testid="select-filter-player">
              <SelectValue placeholder="Filter by player" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Players</SelectItem>
              {profiles?.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeGames.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Active Games
            <Badge variant="outline">{activeGames.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeGames.map((game) => (
              <ActiveGameCard
                key={game.id}
                game={game}
                player1={getProfile(game.player1Id)}
                player2={getProfile(game.player2Id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <HistoryIcon className="h-5 w-5" />
          Completed Games
          {filteredGames.length > 0 && (
            <Badge variant="secondary">{filteredGames.length}</Badge>
          )}
        </h2>

        {gamesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-4">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game) => (
              <CompletedGameCard
                key={game.id}
                game={game}
                player1={getProfile(game.player1Id)}
                player2={getProfile(game.player2Id)}
                winner={game.winnerId ? getProfile(game.winnerId) : undefined}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <HistoryIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Completed Games</h3>
              <p className="text-muted-foreground text-center mb-4">
                {filterPlayer !== "all"
                  ? "This player hasn't completed any games yet."
                  : "Start a new game to build your history."}
              </p>
              <Link href="/new">
                <Button className="gap-2" data-testid="button-start-new-game">
                  <Play className="h-4 w-4" />
                  Start New Game
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ActiveGameCard({
  game,
  player1,
  player2,
}: {
  game: Game;
  player1?: Profile;
  player2?: Profile;
}) {
  const isOvertime = game.status === "overtime";
  
  return (
    <Link href={`/game/${game.id}`}>
      <Card className="hover-elevate cursor-pointer border-primary/30" data-testid={`card-active-game-${game.id}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <Badge variant={isOvertime ? "destructive" : "default"} className="text-xs">
              {isOvertime ? "Overtime" : "In Progress"}
            </Badge>
            <span className="text-xs text-muted-foreground">Q{game.currentQuarter}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <p className="text-sm text-muted-foreground truncate">
                {player1?.name ?? "Player 1"}
              </p>
              <p className="text-2xl font-bold font-mono">{game.player1Score}</p>
            </div>
            <div className="text-muted-foreground text-sm">vs</div>
            <div className="flex-1 text-center">
              <p className="text-sm text-muted-foreground truncate">
                {player2?.name ?? "Player 2"}
              </p>
              <p className="text-2xl font-bold font-mono">{game.player2Score}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompletedGameCard({
  game,
  player1,
  player2,
  winner,
}: {
  game: Game;
  player1?: Profile;
  player2?: Profile;
  winner?: Profile;
}) {
  const formattedDate = game.completedAt
    ? new Date(game.completedAt).toLocaleDateString()
    : game.createdAt
    ? new Date(game.createdAt).toLocaleDateString()
    : "";

  const totalPoints = game.player1Score + game.player2Score;
  const margin = Math.abs(game.player1Score - game.player2Score);
  const isCloseGame = margin <= 7;
  const isBlowout = margin >= 21;
  
  const p1Win = game.winnerId === game.player1Id;

  return (
    <Link href={`/game/${game.id}`}>
      <Card className="hover-elevate cursor-pointer" data-testid={`card-completed-game-${game.id}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            {winner && (
              <div className="flex items-center gap-1 text-xs text-primary">
                <Trophy className="h-3 w-3" />
                <span className="truncate max-w-24">{winner.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              {isCloseGame && (
                <Badge variant="outline" className="text-xs">Close</Badge>
              )}
              {isBlowout && (
                <Badge variant="secondary" className="text-xs">Blowout</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className={`flex-1 text-center ${p1Win ? "text-primary" : ""}`}>
              <p className="text-sm text-muted-foreground truncate">
                {player1?.name ?? "Player 1"}
              </p>
              <p className="text-2xl font-bold font-mono">{game.player1Score}</p>
            </div>
            <div className="text-muted-foreground text-sm">vs</div>
            <div className={`flex-1 text-center ${!p1Win ? "text-primary" : ""}`}>
              <p className="text-sm text-muted-foreground truncate">
                {player2?.name ?? "Player 2"}
              </p>
              <p className="text-2xl font-bold font-mono">{game.player2Score}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </div>
            <div>
              {totalPoints} total pts
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
