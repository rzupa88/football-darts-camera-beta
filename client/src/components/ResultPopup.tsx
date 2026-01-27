import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Profile } from "@shared/schema";

export type PopupType = "celebration" | "sad" | null;

interface ResultPopupProps {
  type: PopupType;
  player: Profile | null;
  message?: string;
  // duration kept optional, but default behavior is "close on video end"
  duration?: number;
  onClose: () => void;
}

const EXIT_MS = 300;

export default function ResultPopup({
  type,
  player,
  message,
  duration, // if provided, acts as a fallback max-time
  onClose,
}: ResultPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const closeTimeoutRef = useRef<number | null>(null);
  const exitTimeoutRef = useRef<number | null>(null);

  const videoUrl = useMemo(() => {
    const raw =
      type === "celebration" ? player?.celebrationVideo : player?.sadVideo;
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return "";
    if (trimmed === "null" || trimmed === "undefined") return "";
    return trimmed;
  }, [type, player]);

  const beginClose = () => {
    if (exitTimeoutRef.current) window.clearTimeout(exitTimeoutRef.current);
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);

    setIsExiting(true);

    closeTimeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, EXIT_MS);
  };

  useEffect(() => {
    // reset timers whenever popup is triggered
    if (type && player) {
      setIsVisible(true);
      setIsExiting(false);
      setVideoError(null);

      // Optional fallback: if you pass duration, force-close after that time
      if (typeof duration === "number" && duration > 0) {
        exitTimeoutRef.current = window.setTimeout(() => {
          beginClose();
        }, Math.max(0, duration - EXIT_MS));
      }

      return () => {
        if (exitTimeoutRef.current) window.clearTimeout(exitTimeoutRef.current);
        if (closeTimeoutRef.current)
          window.clearTimeout(closeTimeoutRef.current);
      };
    }
  }, [type, player, duration]);

  if (!type || !player || !isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/70 transition-opacity duration-300",
        isExiting ? "opacity-0" : "opacity-100",
      )}
      onClick={beginClose}
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
        <p className="text-xl font-bold text-white" data-testid="text-popup-player">
          {player.name}
        </p>

        <div className="relative max-w-[80vw] max-h-[70vh] rounded-lg overflow-hidden">
          {!videoUrl ? (
            <div className="p-6 text-center text-slate-200">
              <p className="font-semibold">No video set for this player.</p>
              <p className="text-sm text-slate-400 mt-2">
                Missing field:{" "}
                <span className="font-mono">
                  {type === "celebration" ? "celebrationVideo" : "sadVideo"}
                </span>
              </p>
            </div>
          ) : videoError ? (
            <div className="p-6 text-center text-slate-200">
              <p className="font-semibold">Video failed to load.</p>
              <p className="text-sm text-slate-400 mt-2 font-mono break-all">{videoUrl}</p>
              <p className="text-sm text-red-400 mt-2">{videoError}</p>
            </div>
          ) : (
            <video
              key={videoUrl}            // ✅ forces reload when url changes
              src={videoUrl}
              autoPlay
              muted
              playsInline
              preload="auto"
              className="max-w-full max-h-[70vh] object-contain"
              data-testid="video-popup"
              onEnded={beginClose}      // ✅ close when the 5s video ends
              onError={() => {
                setVideoError("Video failed to load (URL, CORS, codec, or not a direct mp4).");
                console.warn("[ResultPopup] video error", {
                  type,
                  name: player.name,
                  videoUrl,
                });
              }}
            />
          )}
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
