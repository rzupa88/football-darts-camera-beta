import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Coins, Plus, Play, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Profile, Game } from "@shared/schema";
import { cn } from "@/lib/utils";

type Step = "players" | "coin-flip" | "choose" | "ready";

export default function NewGame() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<Step>("players");
  const [player1Id, setPlayer1Id] = useState<string>("");
  const [player2Id, setPlayer2Id] = useState<string>("");
  const [coinFlipWinner, setCoinFlipWinner] = useState<1 | 2 | null>(null);
  const [firstPossession, setFirstPossession] = useState<1 | 2 | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  const { data: profiles, isLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });

  const createProfileMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/profiles", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setNewProfileOpen(false);
      setNewProfileName("");
      toast({
        title: "Profile created",
        description: "New player profile has been created.",
      });
    },
  });

  const createGameMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/games", {
        player1Id,
        player2Id,
        possession: firstPossession,
      });
      return response.json();
    },
    onSuccess: (game: Game) => {
      navigate(`/game/${game.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create game. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCoinFlip = () => {
    setIsFlipping(true);
    
    setTimeout(() => {
      const result = Math.random() < 0.5 ? 1 : 2;
      setCoinFlipWinner(result as 1 | 2);
      setIsFlipping(false);
      setStep("choose");
    }, 800);
  };

  const handleChoice = (choice: "receive" | "defer") => {
    if (!coinFlipWinner) return;
    if (choice === "receive") {
      setFirstPossession(coinFlipWinner);
    } else {
      setFirstPossession(coinFlipWinner === 1 ? 2 : 1);
    }
    setStep("ready");
  };

  const handleStartGame = () => {
    createGameMutation.mutate();
  };

  const player1 = profiles?.find((p) => p.id === player1Id);
  const player2 = profiles?.find((p) => p.id === player2Id);

  const canProceedToFlip = player1Id && player2Id && player1Id !== player2Id;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">New Game</h1>
        <p className="text-muted-foreground">
          Select players and flip the coin to start
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        <StepIndicator active={step === "players"} complete={step !== "players"} label="1" />
        <div className="w-12 h-0.5 bg-border" />
        <StepIndicator active={step === "coin-flip"} complete={step === "choose" || step === "ready"} label="2" />
        <div className="w-12 h-0.5 bg-border" />
        <StepIndicator active={step === "choose"} complete={step === "ready"} label="3" />
        <div className="w-12 h-0.5 bg-border" />
        <StepIndicator active={step === "ready"} complete={false} label="4" />
      </div>

      {step === "players" && (
        <Card>
          <CardHeader>
            <CardTitle>Select Players</CardTitle>
            <CardDescription>Choose two players for this match</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Player 1</Label>
                  <Select value={player1Id} onValueChange={setPlayer1Id}>
                    <SelectTrigger data-testid="select-player1">
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map((profile) => (
                        <SelectItem 
                          key={profile.id} 
                          value={profile.id}
                          disabled={profile.id === player2Id}
                        >
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Player 2</Label>
                  <Select value={player2Id} onValueChange={setPlayer2Id}>
                    <SelectTrigger data-testid="select-player2">
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map((profile) => (
                        <SelectItem 
                          key={profile.id} 
                          value={profile.id}
                          disabled={profile.id === player1Id}
                        >
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Dialog open={newProfileOpen} onOpenChange={setNewProfileOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full gap-2" data-testid="button-create-profile-inline">
                      <Plus className="h-4 w-4" />
                      Create New Profile
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newProfileName.trim()) {
                          createProfileMutation.mutate(newProfileName.trim());
                        }
                      }}
                    >
                      <DialogHeader>
                        <DialogTitle>Create Profile</DialogTitle>
                        <DialogDescription>
                          Add a new player to the game.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <Label htmlFor="newName">Player Name</Label>
                        <Input
                          id="newName"
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          placeholder="Enter player name"
                          className="mt-2"
                          data-testid="input-new-profile-name"
                          autoFocus
                        />
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setNewProfileOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={!newProfileName.trim() || createProfileMutation.isPending}
                          data-testid="button-submit-new-profile"
                        >
                          Create
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <Button
                  className="w-full gap-2"
                  disabled={!canProceedToFlip}
                  onClick={() => setStep("coin-flip")}
                  data-testid="button-next-to-flip"
                >
                  Next: Coin Flip
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === "coin-flip" && (
        <Card>
          <CardHeader>
            <CardTitle>Coin Flip</CardTitle>
            <CardDescription>
              Flip the coin to determine who receives first
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center gap-8 py-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <span className="font-bold text-primary">1</span>
                </div>
                <p className="font-medium">{player1?.name}</p>
              </div>
              <span className="text-muted-foreground">vs</span>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <span className="font-bold text-primary">2</span>
                </div>
                <p className="font-medium">{player2?.name}</p>
              </div>
            </div>

            <Button
              size="lg"
              className={cn(
                "w-full gap-2 transition-transform",
                isFlipping && "animate-spin"
              )}
              onClick={handleCoinFlip}
              disabled={isFlipping}
              data-testid="button-flip-coin"
            >
              <Coins className="h-5 w-5" />
              {isFlipping ? "Flipping..." : "Flip Coin"}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setStep("players")}
            >
              Back to Player Selection
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "choose" && coinFlipWinner && (
        <Card>
          <CardHeader>
            <CardTitle>
              {coinFlipWinner === 1 ? player1?.name : player2?.name} Wins the Toss!
            </CardTitle>
            <CardDescription>
              Choose to receive the ball first or defer to the second half
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 mb-3">
                <Coins className="h-8 w-8 text-amber-500" />
              </div>
              <p className="text-lg font-semibold">
                {coinFlipWinner === 1 ? player1?.name : player2?.name}
              </p>
              <p className="text-sm text-muted-foreground">won the coin toss</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button
                size="lg"
                className="flex flex-col h-auto py-4 gap-1"
                onClick={() => handleChoice("receive")}
                data-testid="button-receive"
              >
                <span className="font-bold">Receive</span>
                <span className="text-xs opacity-80">Get ball first</span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex flex-col h-auto py-4 gap-1"
                onClick={() => handleChoice("defer")}
                data-testid="button-defer"
              >
                <span className="font-bold">Defer</span>
                <span className="text-xs opacity-80">Receive 2nd half</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setCoinFlipWinner(null);
                setStep("coin-flip");
              }}
            >
              Flip Again
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "ready" && firstPossession && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Play!</CardTitle>
            <CardDescription>
              Coin flip complete - let's start the game
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                <Play className="h-10 w-10 text-primary" />
              </div>
              <p className="text-lg font-semibold mb-1">
                {firstPossession === 1 ? player1?.name : player2?.name}
              </p>
              <p className="text-muted-foreground">receives first</p>
            </div>

            <div className="flex items-center justify-center gap-8 py-4 border-t">
              <div className={cn(
                "text-center transition-opacity",
                firstPossession !== 1 && "opacity-50"
              )}>
                <p className="font-medium">{player1?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {firstPossession === 1 ? "Offense" : "Defense"}
                </p>
              </div>
              <span className="text-muted-foreground">vs</span>
              <div className={cn(
                "text-center transition-opacity",
                firstPossession !== 2 && "opacity-50"
              )}>
                <p className="font-medium">{player2?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {firstPossession === 2 ? "Offense" : "Defense"}
                </p>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full gap-2"
              onClick={handleStartGame}
              disabled={createGameMutation.isPending}
              data-testid="button-start-game"
            >
              <Play className="h-5 w-5" />
              {createGameMutation.isPending ? "Starting..." : "Start Game"}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setFirstPossession(null);
                setCoinFlipWinner(null);
                setStep("coin-flip");
              }}
            >
              Flip Again
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
        active && "bg-primary text-primary-foreground",
        complete && "bg-primary/20 text-primary",
        !active && !complete && "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </div>
  );
}
