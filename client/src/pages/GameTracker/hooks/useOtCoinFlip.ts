import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useOtCoinFlip({
  id,
  onComplete,
  toast,
}: {
  id: string | undefined;
  onComplete: () => Promise<void>;
  toast: (args: { title: string; description?: string; variant?: "destructive" }) => void;
}) {
  const [otCoinFlipWinner, setOtCoinFlipWinner] = useState<1 | 2 | null>(null);
  const [isOtFlipping, setIsOtFlipping] = useState(false);

  const handleOtCoinFlip = () => {
    setIsOtFlipping(true);
    setTimeout(() => {
      const result = Math.random() < 0.5 ? 1 : 2;
      setOtCoinFlipWinner(result);
      setIsOtFlipping(false);
    }, 800);
  };

  const otCoinFlipMutation = useMutation({
    mutationFn: async ({ winner, choice }: { winner: 1 | 2; choice: "receive" | "defer" }) => {
      return apiRequest("POST", `/api/games/${id}/ot-coin-flip`, { winner, choice });
    },
    onSuccess: async () => {
      await onComplete();
      setOtCoinFlipWinner(null);
      toast({ title: "Overtime coin flip complete!" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process OT coin flip. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    otCoinFlipWinner,
    setOtCoinFlipWinner,
    isOtFlipping,
    handleOtCoinFlip,
    otCoinFlipMutation,
  };
}
