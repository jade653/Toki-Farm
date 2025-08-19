// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { Providers } from "./providers";
import PrefetchMyNFTs from "@/components/PrefetchMyNFTs";

export const metadata: Metadata = {
  title: "Toki Farm",
  description: "Pair and explore Toki on Sui.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers>
          <PrefetchMyNFTs />
          {/* Background layer */}
          <div
            aria-hidden
            className="fixed inset-0 -z-10 bg-center bg-no-repeat"
            style={{
              backgroundImage: "url('/background.png')",
              backgroundSize: "cover", // 이미지 꽉 채우기. (타일처럼 반복하려면 'auto' + bg-repeat)
            }}
          />
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
