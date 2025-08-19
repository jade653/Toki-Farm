"use client";

import clsx from "clsx";

type Props = {
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export default function WoodSign({ label, size = "md", className }: Props) {
  const sizeClass = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-lg",
    lg: "px-8 py-4 text-2xl",
  }[size];

  return (
    <div
      className={clsx(
        // 나무 배경 느낌
        "inline-flex items-center justify-center select-none",
        "rounded-lg border-b-4",
        "bg-gradient-to-b from-amber-600 to-amber-800 border-amber-900",
        "font-extrabold uppercase tracking-wide text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]",
        "shadow-md",
        // 누를 때 효과
        "transition-transform active:scale-[0.90]",
        sizeClass,
        className
      )}
    >
      {label}
    </div>
  );
}
