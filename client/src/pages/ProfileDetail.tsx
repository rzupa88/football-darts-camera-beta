import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Trophy, Target, TrendingUp, Crosshair, Goal, Percent, Settings } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import HeatMapDartboard from "@/components/HeatMapDartboard";
import type { Profile, ProfileStats, HeadToHead, Game } from "@shared/schema";

export default function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCelebrationVideo, setEditCelebrationVideo] = useState("");
  const [editSadVideo, setEditSadVideo] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: ["/api/profiles", id],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ProfileStats>({
    queryKey: ["/api/profiles", id, "stats"],
  });

  const { data: headToHead } = useQuery<HeadToHead[]>({
    queryKey: ["/api/profiles", id, "head-to-head"],
  });

  const { data: gameHistory } = useQuery<Game[]>({
    queryKey: ["/api/profiles", id, "games"],
  });

  const { data: allProfiles } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });

  const opponents = allProfiles?.filter(p => p.id !== id) ?? [];

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; celebrationVideo?: string; sadVideo?: string }) => {
      return apiRequest("PATCH", `/api/profiles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setEditOpen(false);
      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const openEditDialog = () => {
    if (profile) {
      setEditName(profile.name);
      setEditCelebrationVideo(profile.celebrationVideo ?? "");
      setEditSadVideo(profile.sadVideo ?? "");
      setEditOpen(true);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      name: editName.trim() || undefined,
      celebrationVideo: editCelebrationVideo.trim() || undefined,
      sadVideo: editSadVideo.trim() || undefined,
    });
  };

  if (profileLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold mb-2">Profile Not Found</h3>
            <Link href="/profiles">
              <Button>Back to Profiles</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link href="/profiles">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{profile.name}</h1>
            <p className="text-muted-foreground">Player Statistics</p>
          </div>
        </div>
        
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" onClick={openEditDialog} data-testid="button-edit-profile">
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleEditSubmit}>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
                <DialogDescription>
                  Update player name and celebration/sad videos (MP4 URLs).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Player Name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter player name"
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-celebration">Celebration Video (MP4 URL)</Label>
                  <Input
                    id="edit-celebration"
                    value={editCelebrationVideo}
                    onChange={(e) => setEditCelebrationVideo(e.target.value)}
                    placeholder="https://example.com/celebration.mp4"
                    data-testid="input-edit-celebration"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shows when scoring a TD or FG
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sad">Sad Video (MP4 URL)</Label>
                  <Input
                    id="edit-sad"
                    value={editSadVideo}
                    onChange={(e) => setEditSadVideo(e.target.value)}
                    placeholder="https://example.com/sad.mp4"
                    data-testid="input-edit-sad"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shows on bust, turnover, or missed FG
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!editName.trim() || updateMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Trophy}
          label="Win Rate"
          value={`${stats?.winPercentage?.toFixed(0) ?? 0}%`}
          loading={statsLoading}
        />
        <StatCard
          icon={Target}
          label="Games Played"
          value={String(stats?.games ?? 0)}
          loading={statsLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Total Points"
          value={String(stats?.totalPoints ?? 0)}
          loading={statsLoading}
        />
        <StatCard
          icon={Crosshair}
          label="Points/Game"
          value={stats?.pointsPerGame?.toFixed(1) ?? "0.0"}
          loading={statsLoading}
        />
      </div>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="stats" data-testid="tab-stats">Stats</TabsTrigger>
          <TabsTrigger value="h2h" data-testid="tab-h2h">H2H</TabsTrigger>
          <TabsTrigger value="heatmap" data-testid="tab-heatmap">Heat Map</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Goal className="h-5 w-5" />
                  Scoring
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <StatRow label="Touchdowns" value={stats?.touchdowns ?? 0} />
                  <StatRow label="Inner Bull TDs" value={stats?.innerBullTDs ?? 0} />
                  <StatRow label="Total Drives" value={stats?.drives ?? 0} />
                  <StatRow label="Points/Drive" value={stats?.pointsPerDrive?.toFixed(2) ?? "0.00"} />
                  <StatRow label="Total Yards" value={stats?.totalYards ?? 0} />
                  <StatRow label="Yards/Game" value={stats?.yardsPerGame?.toFixed(1) ?? "0.0"} />
                  <StatRow label="Total Darts" value={stats?.totalDarts ?? 0} />
                  <StatRow label="Yards/Dart" value={stats?.yardsPerDart?.toFixed(1) ?? "0.0"} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Special Teams
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <StatRow 
                    label="Field Goals" 
                    value={`${stats?.fgMakes ?? 0}/${stats?.fgAttempts ?? 0} (${stats?.fgPercentage?.toFixed(0) ?? 0}%)`} 
                  />
                  <StatRow 
                    label="PAT" 
                    value={`${stats?.patMakes ?? 0}/${stats?.patAttempts ?? 0} (${stats?.patPercentage?.toFixed(0) ?? 0}%)`} 
                  />
                  <StatRow 
                    label="2-Point Conv" 
                    value={`${stats?.twoPtMakes ?? 0}/${stats?.twoPtAttempts ?? 0} (${stats?.twoPtPercentage?.toFixed(0) ?? 0}%)`} 
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Record</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-8">
                  <div className="text-center">
                    <p className="text-4xl font-bold font-mono text-primary">{stats?.wins ?? 0}</p>
                    <p className="text-sm text-muted-foreground">Wins</p>
                  </div>
                  <div className="text-4xl font-mono text-muted-foreground">-</div>
                  <div className="text-center">
                    <p className="text-4xl font-bold font-mono text-destructive">{stats?.losses ?? 0}</p>
                    <p className="text-sm text-muted-foreground">Losses</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="h2h" className="mt-6">
          {headToHead && headToHead.length > 0 ? (
            <div className="space-y-3">
              {headToHead.map((record) => (
                <Card key={record.opponentId}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold">{record.opponentName}</p>
                      <p className="text-sm text-muted-foreground">
                        {record.gamesPlayed} games | PF: {record.pointsFor} PA: {record.pointsAgainst}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg">
                        <span className="text-primary">{record.wins}</span>
                        {" - "}
                        <span className="text-destructive">{record.losses}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No head-to-head records yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="heatmap" className="mt-6">
          <HeatMapDartboard 
            profileId={id!} 
            opponents={opponents}
            games={gameHistory}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {gameHistory && gameHistory.length > 0 ? (
            <div className="space-y-3">
              {gameHistory.map((game) => (
                <GameHistoryCard key={game.id} game={game} profileId={id!} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No games played yet</p>
                <Link href="/new">
                  <Button className="mt-4">Start a Game</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-4">
        <Icon className="h-5 w-5 text-muted-foreground mb-2" />
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold font-mono">{value}</p>
        )}
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function GameHistoryCard({ game, profileId }: { game: Game; profileId: string }) {
  const isPlayer1 = game.player1Id === profileId;
  const myScore = isPlayer1 ? game.player1Score : game.player2Score;
  const theirScore = isPlayer1 ? game.player2Score : game.player1Score;
  const won = game.winnerId === profileId;

  return (
    <Link href={`/game/${game.id}`}>
      <Card className="hover-elevate cursor-pointer" data-testid={`card-game-history-${game.id}`}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${
                won ? "bg-primary" : "bg-destructive"
              }`}
            />
            <div>
              <span className="font-medium">{won ? "Win" : "Loss"}</span>
              <p className="text-xs text-muted-foreground">
                {new Date(game.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="font-mono text-lg">
            <span className={won ? "text-primary" : ""}>{myScore}</span>
            {" - "}
            <span className={!won ? "text-destructive" : ""}>{theirScore}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
