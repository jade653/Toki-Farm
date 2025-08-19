// hooks/useMyNFTs.ts
"use client";
import { useSuiClientQuery, useSuiClientContext } from "@mysten/dapp-kit";
import { useCurrentAccount } from "@mysten/dapp-kit";

export function useMyNFTs() {
  const account = useCurrentAccount();
  const { network } = useSuiClientContext();
  return useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address!,
      options: { showType: true, showContent: true, showDisplay: true },
    },
    {
      enabled: !!account?.address,
      queryKey: ["nfts", network, account?.address, "all"], // 캐시 키 통일
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    }
  );
}
