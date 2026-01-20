import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Profile } from "@shared/schema";

export type PopupType = "celebration" | "sad" | null;

interface ResultPopupProps {
  type: PopupType;
  player: Profile | null;
  message?: string;
  duration?: number;
  onClose: () => void;
}

export default function ResultPopup({
  type,
  player,
  message,
  duration = 10000,
  onClose,
}: ResultPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (type && player) {
      setIsVisible(true);
      setIsExiting(false);

      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, duration - 300);

      const closeTimer = setTimeout(() => {
        setIsVisible(false);
        onClose();
      }, duration);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(closeTimer);
      };
    }
  }, [type, player, duration, onClose]);

  if (!type || !player || !isVisible) return null;

  const videoUrl =
    type === "celebration" ? player.celebrationVideo : player.sadVideo;

  if (!videoUrl) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/70 transition-opacity duration-300",
        isExiting ? "opacity-0" : "opacity-100",
      )}
      onClick={onClose}
      data-testid="result-popup-overlay"
    >
      <div
        className={cn(
          "flex flex-col items-center gap-4 p-6 rounded-lg bg-gradient-to-b from-slate-900 to-slate-800 border border-slate-700 shadow-2xl transition-all duration-300",
          isExiting ? "scale-90 opacity-0" : "scale-100 opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
        data-testid="result-popup-content"
      >
        <p
          className="text-xl font-bold text-white"
          data-testid="text-popup-player"
        >
          {player.name}
        </p>

        <div className="relative max-w-[80vw] max-h-[70vh] rounded-lg overflow-hidden">
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="max-w-full max-h-[70vh] object-contain"
            data-testid="video-popup"
          />
        </div>

        {message && (
          <p
            className={cn(
              "text-lg font-semibold",
              type === "celebration" ? "text-green-400" : "text-red-400",
            )}
            data-testid="text-popup-message"
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
