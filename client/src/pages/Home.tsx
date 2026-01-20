import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Play, BookOpen, Users, Trophy, Crosshair } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Profile, Game } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: profiles, isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const completedGames = games?.filter((g) => g.status === "completed") ?? [];
  const recentGames = completedGames.slice(0, 3);

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/20 py-16 md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-4 relative">
          <div className="flex flex-col items-center text-center gap-6">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-2">
              <Target className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Football Dart Game
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
              A turn-based dart game that simulates American football using field position, 
              drives, special teams, and scoring decisions.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
              <Link href="/new">
                <Button size="lg" className="gap-2" data-testid="button-start-game">
                  <Play className="h-5 w-5" />
                  Start New Game
                </Button>
              </Link>
              <Link href="/rules">
                <Button size="lg" variant="outline" className="gap-2" data-testid="button-view-rules">
                  <BookOpen className="h-5 w-5" />
                  View Rules
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Games
                </CardTitle>
                <Trophy className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {gamesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-3xl font-bold font-mono" data-testid="text-total-games">
                    {completedGames.length}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Profiles
                </CardTitle>
                <Users className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {profilesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-3xl font-bold font-mono" data-testid="text-total-profiles">
                    {profiles?.length ?? 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Games
                </CardTitle>
                <Crosshair className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {gamesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-3xl font-bold font-mono" data-testid="text-active-games">
                    {games?.filter((g) => g.status === "active").length ?? 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {recentGames.length > 0 && (
        <section className="py-8 md:py-12 border-t">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-semibold">Recent Games</h2>
              <Link href="/history">
                <Button variant="ghost" size="sm" data-testid="link-view-all-history">
                  View All
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentGames.map((game) => (
                <RecentGameCard key={game.id} game={game} profiles={profiles ?? []} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-12 md:py-16 border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-semibold text-center mb-8">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <span className="text-xl font-bold text-primary">1</span>
              </div>
              <h3 className="font-semibold">Create Profiles</h3>
              <p className="text-sm text-muted-foreground">
                Set up player profiles to track stats and head-to-head records over time.
              </p>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <span className="text-xl font-bold text-primary">2</span>
              </div>
              <h3 className="font-semibold">Start a Game</h3>
              <p className="text-sm text-muted-foreground">
                Select two players, flip a coin to determine first possession, and begin.
              </p>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <span className="text-xl font-bold text-primary">3</span>
              </div>
              <h3 className="font-semibold">Play Ball</h3>
              <p className="text-sm text-muted-foreground">
                Throw darts to advance, score touchdowns, and make strategic decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RecentGameCard({ game, profiles }: { game: Game; profiles: Profile[] }) {
  const player1 = profiles.find((p) => p.id === game.player1Id);
  const player2 = profiles.find((p) => p.id === game.player2Id);
  const winner = game.winnerId ? profiles.find((p) => p.id === game.winnerId) : null;

  return (
    <Link href={`/game/${game.id}`}>
      <Card className="hover-elevate cursor-pointer" data-testid={`card-game-${game.id}`}>
        <CardContent className="pt-4">
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
          {winner && (
            <p className="text-xs text-center text-primary mt-3 font-medium">
              {winner.name} wins
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
