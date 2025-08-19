"use client";

import { useRouter } from "next/navigation";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { ConnectButton } from "@mysten/dapp-kit";

export default function HomePage() {
  const router = useRouter();
  const account = useCurrentAccount();

  const handleClick = () => {
    if (!account) return; // 연결 안 된 경우
    router.push("/my");
  };

  return (
    <section className="mt-10 flex flex-col items-center gap-6 rounded-2xl border border-lime-100 bg-lime-50/40 p-8 text-center">
      <h1 className="text-3xl font-bold text-emerald-800">
        Welcome to Toki Farm
      </h1>
      <p className="max-w-2xl text-gray-700">
        Breed unique Tokis using ancestor pairs from the Farm. Explore your
        collection, and get ready for future adventures. Connect your wallet to
        get started.
      </p>

      <div className="flex gap-3">
        {account ? (
          <button
            onClick={handleClick}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-white shadow hover:bg-emerald-700"
          >
            Go to My Tokis
          </button>
        ) : (
          <ConnectButton />
        )}
      </div>
    </section>
  );
}
