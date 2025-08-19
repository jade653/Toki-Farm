"use client";

import Link from "next/link";
import { useAppStore } from "@/hooks/useWalletStauts";
import { useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";
import WoodSign from "@/components/WoodSign";
import ConnectWallet from "./ConnectWallet";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = useMemo(() => pathname === href, [pathname, href]);

  return (
    <Link href={href}>
      <WoodSign
        label={label}
        size="sm"
        className={
          active ? "from-amber-600 to-amber-800" : "hover:brightness-110"
        }
      />
    </Link>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Left: Logo */}
        <Link href="/">
          <WoodSign label="toki-farm" size="md" />
        </Link>

        {/* Right: Nav */}
        <nav className="flex items-center gap-3">
          <NavLink href="/adventure" label="Adventure" />
          <NavLink href="/farm" label="Farm" />
          <NavLink href="/my" label="My" />

          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
