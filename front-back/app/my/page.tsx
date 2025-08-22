"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkVariable } from "../providers";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID;
if (!PACKAGE_ID) {
  throw new Error("NEXT_PUBLIC_PACKAGE_ID is not set in .env.local");
}
const TOKI_TYPE = `${PACKAGE_ID}::creature::Toki`;

// pages/my-page.tsx (혹은 해당 파일 상단)
import { useEffect, useState, useMemo } from "react";
import { renderTokiPngDataURLFromU8, PARTS_CATALOG } from "@/utils/renderToki";

// 체인에서 내려오는 phenotype 뷰 타입(ear/eye/mouth만 있다고 가정)
type PhenotypeView = {
  base: number;
  ear: number;
  eye: number;
  mouth: number;
} | null;

// 내가 가진 토키 정보
type TokiView = {
  id: string;
  name: string | null;
  imageUrl: string | null;
  parentA: string | null;
  parentB: string | null;
  phenotype: PhenotypeView;
};

// Toki 이미지를 렌더링하는 컴포넌트
function TokiImage({ toki, size }: { toki: TokiView; size?: number }) {
  if (toki.imageUrl) {
    return (
      <Image
        src={toki.imageUrl}
        alt={toki.id}
        width={size}
        height={size}
        className="h-auto w-full rounded-lg object-cover"
      />
    );
  }
  return <TokiPreview phenotype={toki.phenotype} size={size} />;
}

function TokiPreview({
  phenotype,
  size = 320,
}: {
  phenotype: PhenotypeView;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  const phenoU8 = useMemo(
    () => ({
      base: phenotype?.base ?? 0,
      ears: phenotype?.ear ?? 0,
      eyes: phenotype?.eye ?? 0,
      mouth: phenotype?.mouth ?? 0,
    }),
    [phenotype?.base, phenotype?.ear, phenotype?.eye, phenotype?.mouth]
  );

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    // public/parts/* 를 사용하므로 basePath는 '/parts/'
    renderTokiPngDataURLFromU8(phenoU8, "/parts/")
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [phenoU8.base, phenoU8.ears, phenoU8.eyes, phenoU8.mouth]);

  // 로딩 중 스켈레톤
  if (!src) {
    return (
      <div className="grid h-48 place-items-center rounded-lg bg-gray-100 text-sm text-gray-500">
        rendering…
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="toki-preview"
      width={size}
      height={size}
      className="h-auto w-full rounded-lg object-contain"
      style={{ imageRendering: "pixelated" }}
      draggable={false}
    />
  );
}

// Helper to convert SUI string to MIST BigInt
function suiToMist(sui: string): bigint {
  if (!sui.trim()) return 0n;
  const [integer, fraction = ""] = sui.split(".");
  // Ensure fraction part is not longer than 9 digits and pad with zeros if shorter
  const paddedFraction = fraction.padEnd(9, "0").slice(0, 9);
  return BigInt(integer + paddedFraction);
}
// 토키 상세 정보 모달
function TokiDetailModal({
  toki,
  onClose,
}: {
  toki: TokiView;
  onClose: () => void;
}) {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const queryClient = useQueryClient();
  const packageId = useNetworkVariable("packageId");
  const farmId = useNetworkVariable("farmId");

  const [price, setPrice] = useState("");
  const [fee, setFee] = useState(""); // 수수료 입력 필드 (요청사항)
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    const priceValue = price.trim();
    const feeValue = fee.trim();

    if (priceValue && (isNaN(Number(priceValue)) || Number(priceValue) <= 0)) {
      setError("If provided, price must be a valid positive number.");
      return;
    }
    // fee는 스마트 컨트랙트의 register 함수에 따라 필수입니다.
    if (!feeValue || isNaN(Number(feeValue)) || Number(feeValue) < 0) {
      setError("Please enter a valid, non-negative fee.");
      return;
    }
    if (!packageId || !farmId) {
      setError("Package or Farm ID not found in network config.");
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const tx = new Transaction();
      const priceInMist = priceValue ? suiToMist(priceValue) : null;
      const geneInfo = JSON.stringify(toki.phenotype ?? {});

      tx.moveCall({
        target: `${packageId}::farm::register`,
        arguments: [
          tx.object(farmId),
          tx.object(toki.id),
          tx.pure.u8(Number(feeValue)),
          tx.pure.option("u64", priceInMist),
          tx.pure.string(geneInfo),
        ],
      });

      const result = await signAndExecute({ transaction: tx });

      console.log("Registration successful:", result);
      // MyPage와 FarmPage의 데이터를 새로고침하기 위해 쿼리를 무효화합니다.
      await queryClient.invalidateQueries({ queryKey: ["getOwnedObjects"] });
      await queryClient.invalidateQueries({ queryKey: ["getDynamicFields"] });
      onClose();
    } catch (e: any) {
      setError(e.message || "Registration failed.");
    } finally {
      setIsRegistering(false);
    }
  };

  // 숫자 표현형을 영문 이름으로 변환합니다.
  const resolvedPhenotype = useMemo(() => {
    if (!toki.phenotype) return null;
    const { base, ear, eye, mouth } = toki.phenotype;

    const getPartName = (
      partType: keyof typeof PARTS_CATALOG,
      index: number
    ) => {
      const fileName = PARTS_CATALOG[partType]?.[index] ?? "N/A";
      if (fileName === "N/A") return "N/A";
      // "ears_long.png" -> "long"
      return fileName.replace(`${partType}_`, "").replace(".png", "");
    };

    return {
      Base: getPartName("base", base),
      Ears: getPartName("ears", ear),
      Eyes: getPartName("eyes", eye),
      Mouth: getPartName("mouth", mouth),
    };
  }, [toki.phenotype]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-square w-full">
          {toki.imageUrl ? (
            <Image
              src={toki.imageUrl}
              alt={toki.id}
              width={320}
              height={320}
              className="h-auto w-full rounded-lg object-contain"
            />
          ) : (
            <TokiPreview phenotype={toki.phenotype} size={320} />
          )}
        </div>
        <div className="p-2">
          <h3 className="mb-4 text-4xl font-bold text-emerald-900">
            {toki.name ?? `Toki #${toki.id.slice(0, 6)}`}
          </h3>
          {/* NFT 정보 섹션 */}
          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-lg">
            <div>
              <div className="font-semibold text-gray-800">ID</div>
              <p className="break-all text-base text-black">{toki.id}</p>
            </div>
            <div>
              <div className="font-semibold text-gray-800">Phenotype</div>
              {resolvedPhenotype && (
                <div className="grid grid-cols-2 text-black">
                  {Object.entries(resolvedPhenotype).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-800">Parent A</div>
              <p className="break-all text-base text-black">
                {toki.parentA ?? "-"}
              </p>
            </div>
            <div>
              <div className="font-semibold text-gray-800">Parent B</div>
              <p className="break-all text-base text-black">
                {toki.parentB ?? "-"}
              </p>
            </div>
          </div>

          {/* NFT 등록 폼 섹션 */}
          <div className="mt-4 border-t pt-4">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800">
              Register for Sale
            </h4>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="price"
                  className="block text-lg font-medium text-black"
                >
                  Price - Optional
                </label>
                <div className="relative mt-1 rounded-md shadow-sm">
                  <input
                    type="number"
                    id="price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="block w-full rounded-md border-gray-300 pr-12 focus:border-emerald-500 focus:ring-emerald-500 sm:text-lg font-bold text-emerald-800 placeholder:text-red-500"
                    placeholder="Leave empty if not for sale."
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-gray-800 sm:text-lg">SUI</span>
                  </div>
                </div>
              </div>
              <div>
                <label
                  htmlFor="fee"
                  className="block text-lg font-medium text-black"
                >
                  Fee
                </label>
                <div className="relative mt-1 rounded-md shadow-sm">
                  <input
                    type="number"
                    id="fee"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="block w-full rounded-md border-gray-300 focus:border-emerald-500 focus:ring-emerald-500 sm:text-lg font-bold text-emerald-800"
                    placeholder="e.g., 10"
                    aria-describedby="fee-description"
                  />
                </div>
                <p
                  className="mt-1 text-base text-gray-800"
                  id="fee-description"
                >
                  A fee for registering the Toki.
                </p>
              </div>
            </div>
            {error && <p className="mt-2 text-lg text-red-600">{error}</p>}
            <button
              onClick={handleRegister}
              disabled={isRegistering || !fee}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-5 py-3 text-xl font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {isRegistering ? "Registering..." : "Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 원하는 형태로 가공
function extractTokiView(o: any): TokiView {
  const fields = o?.content?.fields ?? {};
  const phenotypeFields = fields?.phenotype?.fields ?? null;

  return {
    id: o?.objectId as string,
    name: fields?.name ?? null,
    imageUrl: fields?.image_url ?? null,
    parentA: fields?.parent_a ?? null,
    parentB: fields?.parent_b ?? null,
    phenotype: phenotypeFields
      ? {
          base: phenotypeFields.base,
          ear: phenotypeFields.ear,
          eye: phenotypeFields.eye,
          mouth: phenotypeFields.mouth,
        }
      : null,
  };
}

export default function MyPage() {
  const account = useCurrentAccount();
  const [selectedToki, setSelectedToki] = useState<TokiView | null>(null);

  // 훅은 항상 호출
  const { data, isLoading, isError } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address,
      filter: { StructType: TOKI_TYPE },
      options: { showType: true, showContent: true, showDisplay: true },
    },
    {
      enabled: !!account?.address,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    }
  );

  const items = (data?.data ?? []).map((it: any) => it.data).filter(Boolean);
  const myTokis: TokiView[] = items.map(extractTokiView);

  // UI 분기
  if (!account) {
    return (
      <section className="mt-10 flex flex-col items-center gap-6 rounded-2xl border border-lime-100 bg-lime-50/40 p-8 text-center">
        <h2 className="text-xl font-semibold text-emerald-900">
          Wallet not connected
        </h2>
        <p className="max-w-md text-gray-600">
          Connect your wallet to see your Tokis.
        </p>
        <ConnectButton />
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="grid place-items-center rounded-2xl border border-lime-200 p-16 text-center">
        <p className="text-gray-700">Loading your Tokis…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="grid place-items-center rounded-2xl border border-red-200 p-16 text-center">
        <p className="text-red-700">Failed to load your Tokis.</p>
      </section>
    );
  }

  if (myTokis.length === 0) {
    return (
      <section className="grid place-items-center rounded-2xl p-16 text-center">
        <div className="max-w-md">
          <h2 className="text-2xl font-bold text-emerald-800">
            Meet your own Tokis!
          </h2>
          <p className="mt-2 text-gray-700">
            You don’t have any Tokis yet. Create one by pairing ancestors on the
            Farm.
          </p>
          <Link
            href="/farm"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow hover:bg-emerald-700"
          >
            Go to Farm
          </Link>
        </div>
      </section>
    );
  }

  return (
    <main className="flex h-[calc(100vh-120px)] flex-col">
      <div className="flex flex-1 items-center justify-center p-4">
        <h1 className="max-w-xl text-center text-3xl font-bold text-emerald-900/80 md:text-4xl">
          Your friend Toki wants to go on an adventure with you.
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <ul className="grid grid-cols-1 justify-items-center gap-8 px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {myTokis.map((t) => (
            <li
              key={t.id}
              className="group w-72 cursor-pointer text-center transition-transform hover:-translate-y-2"
              onClick={() => setSelectedToki(t)}
            >
              <div className="transition group-hover:drop-shadow-xl">
                <TokiImage toki={t} size={400} />
              </div>
              <div className="mt-2 font-semibold text-emerald-900">
                {t.name ?? `Toki #${t.id.slice(0, 6)}`}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {selectedToki && (
        <TokiDetailModal
          toki={selectedToki}
          onClose={() => setSelectedToki(null)}
        />
      )}
    </main>
  );
}
