"use client";

import "@mysten/dapp-kit/dist/index.css"; // dapp-kit 기본 스타일
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// 네트워크 설정. .env.local의 변수들을 사용합니다.
const { networkConfig, useNetworkVariable } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      packageId: process.env.NEXT_PUBLIC_PACKAGE_ID!,
      farmId: process.env.NEXT_PUBLIC_FARM_ID!,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient는 컴포넌트 재렌더 시 재생성되지 않도록 lazy init
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export { useNetworkVariable }; // 아래에서 패키지ID 등 꺼내 쓸 때 사용
