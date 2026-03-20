"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PlayIcon,
  PauseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";

export function AudioPlayer({
  audioBase64,
  script,
}: {
  audioBase64: string;
  script: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showScript, setShowScript] = useState(false);

  const audioSrc = `data:audio/wav;base64,${audioBase64}`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="w-full max-w-md mx-auto rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />

      {/* Player Controls */}
      <div className="flex items-center gap-4">
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full size-10 p-0"
          onClick={togglePlay}
        >
          {isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4 ml-0.5" />
          )}
        </Button>

        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 rounded-full appearance-none bg-foreground/10 accent-foreground cursor-pointer"
          />
          <div className="flex justify-between text-xs text-foreground/40">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Script Toggle */}
      <button
        onClick={() => setShowScript(!showScript)}
        className="mt-3 flex items-center gap-1.5 text-sm text-foreground/50 hover:text-foreground/70 transition-colors"
      >
        {showScript ? (
          <ChevronUpIcon className="size-3.5" />
        ) : (
          <ChevronDownIcon className="size-3.5" />
        )}
        스크립트 {showScript ? "접기" : "보기"}
      </button>

      {/* Script Content */}
      {showScript && (
        <div className="mt-3 rounded-lg bg-foreground/5 p-4 text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {script}
        </div>
      )}
    </div>
  );
}
