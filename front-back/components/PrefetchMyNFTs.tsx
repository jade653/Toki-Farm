// components/PrefetchMyNFTs.tsx
"use client";
import { useEffect } from "react";
import { useSuiClient, useSuiClientContext } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit";

export default function PrefetchMyNFTs() {
  const qc = useQueryClient();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const account = useCurrentAccount();

  useEffect(() => {
    if (!account?.address) return;
    qc.prefetchQuery({
      queryKey: ["nfts", network, account.address, "all"],
      queryFn: () =>
        client.getOwnedObjects({
          owner: account.address,
          options: { showType: true, showContent: true, showDisplay: true },
        }),
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    });
  }, [account?.address, client, network, qc]);

  return null;
}
