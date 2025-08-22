// hooks/useTxRefetch.ts
"use client";

import { useCallback } from "react";
import { useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useQueryClient } from "@tanstack/react-query";

type ExecuteTxOptions = {
  /** 기본값: true — 모든 suiClient 쿼리 무효화 */
  invalidateAllSuiClientQueries?: boolean;
  /** 특정 queryKey들만 무효화하고 싶을 때 */
  extraInvalidateKeys?: { queryKey: unknown[] }[];
};

export function useTxRefetch() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();

  const executeTx = useCallback(
    async (
      build: (tx: Transaction) => void | Promise<void>,
      opts: ExecuteTxOptions = { invalidateAllSuiClientQueries: true }
    ) => {
      const tx = new Transaction();
      await build(tx);

      const res = await signAndExecute({ transaction: tx });
      await suiClient.waitForTransaction({ digest: res.digest });

      // 1) 전역적으로: 모든 suiClient 쿼리 invalidate (기본)
      if (opts.invalidateAllSuiClientQueries !== false) {
        await queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === "suiClient",
        });
        // ✅ 즉시 다시 가져오기
        await queryClient.refetchQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === "suiClient",
          // refetchType: "active", // 활성쿼리만 원하면 주석 해제
        });
      }

      // 2) 선택적으로: 추가 키 invalidate + 즉시 refetch
      if (opts.extraInvalidateKeys?.length) {
        for (const k of opts.extraInvalidateKeys) {
          await queryClient.invalidateQueries(k);
          await queryClient.refetchQueries(k);
        }
      }

      return res;
    },
    [signAndExecute, suiClient, queryClient]
  );

  return { executeTx };
}
