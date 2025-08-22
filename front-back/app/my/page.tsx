"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { renderTokiPngDataURLFromU8, PARTS_CATALOG } from "@/utils/renderToki";
import { useTxRefetch } from "@/hooks/useTxRefetch";

// ===== .env =====
// NEXT_PUBLIC_PACKAGE_ID=0x...
// NEXT_PUBLIC_FARM_ID=0x...
const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID;
const FARM_ID = process.env.NEXT_PUBLIC_FARM_ID;

if (!PACKAGE_ID)
  throw new Error("NEXT_PUBLIC_PACKAGE_ID is not set in .env.local");
if (!FARM_ID) throw new Error("NEXT_PUBLIC_FARM_ID is not set in .env.local");

const TOKI_TYPE = `${PACKAGE_ID}::creature::Toki`;

// 체인에서 내려오는 phenotype 뷰 타입
type PhenotypeView = {
  base: number;
  ear: number;
  eye: number;
  mouth: number;
} | null;

type TokiView = {
  id: string;
  name: string | null;
  imageUrl: string | null;
  parentA: string | null;
  parentB: string | null;
  phenotype: PhenotypeView;
};

type GeneRow = {
  locus: number;
  a1: number;
  a2: number;
  rule: number;
};

// ============== 이미지 ==============
function TokiImage({ toki, size = 320 }: { toki: TokiView; size?: number }) {
  if (toki.imageUrl && !toki.imageUrl.startsWith("https://")) {
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

// ============== 유틸 ==============
// "1.23" SUI -> 1230000000 MIST (BigInt)
function suiToMist(sui: string): bigint {
  const trimmed = sui.trim();
  if (!trimmed) return 0n;
  const [integer, fraction = ""] = trimmed.split(".");
  const paddedFraction = fraction.padEnd(9, "0").slice(0, 9);
  return BigInt(`${integer}${paddedFraction}`);
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

// ============== 상세 모달(등록) ==============
function TokiDetailModal({
  toki,
  onClose,
}: {
  toki: TokiView;
  onClose: () => void;
}) {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const queryClient = useQueryClient();
  const router = useRouter();
  const client = useSuiClient(); // ✅ genes 조회용 클라이언트

  const [price, setPrice] = useState("");
  const [fee, setFee] = useState(""); // SUI 단위로 입력받음
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Genes 상태
  const [genes, setGenes] = useState<GeneRow[]>([]);
  const [loadingGenes, setLoadingGenes] = useState(false);

  // 숫자 표현형 -> 이름
  const resolvedPhenotype = useMemo(() => {
    if (!toki.phenotype) return null;
    const { base, ear, eye, mouth } = toki.phenotype;

    const getPartName = (
      partType: keyof typeof PARTS_CATALOG,
      index: number
    ) => {
      const fileName = PARTS_CATALOG[partType]?.[index] ?? "N/A";
      if (fileName === "N/A") return "N/A";
      return fileName.replace(`${partType}_`, "").replace(".png", "");
    };

    return {
      Base: getPartName("base", base),
      Ears: getPartName("ears", ear),
      Eyes: getPartName("eyes", eye),
      Mouth: getPartName("mouth", mouth),
    };
  }, [toki.phenotype]);

  // ✅ Genes 로딩 (Toki object에서 genes Table<u8, GenePair> 찾아서 전개)
  useEffect(() => {
    let aborted = false;

    async function loadGenes() {
      try {
        setLoadingGenes(true);
        setGenes([]);

        // Toki 자체를 읽어 genes 테이블 ID 조회
        const obj = await client.getObject({
          id: toki.id,
          options: { showContent: true },
        });

        const genesTableId = (obj.data as any)?.content?.fields?.genes?.fields
          ?.id?.id;
        if (!genesTableId) {
          if (!aborted) setGenes([]);
          return;
        }

        // genes 테이블의 dynamic fields 나열
        const df = await client.getDynamicFields({ parentId: genesTableId });
        if (df.data.length === 0) {
          if (!aborted) setGenes([]);
          return;
        }

        const ids = df.data.map((d) => d.objectId);
        const items = await client.multiGetObjects({
          ids,
          options: { showContent: true },
        });

        const rows: GeneRow[] = items
          .map((resp) => {
            const fo = (resp.data as any)?.content?.fields;
            if (!fo) return null;

            // key (locus)
            const keyRaw =
              fo.name?.fields?.value ??
              fo.name?.value ??
              fo.name ??
              fo.key?.fields?.value ??
              fo.key?.value ??
              fo.key;
            const locus = Number(keyRaw ?? 0);

            // value = GenePair { a1, a2, rule }
            const val = fo.value?.fields ?? fo.value ?? null;
            if (!val) return null;

            const a1 = Number(val.a1 ?? 0);
            const a2 = Number(val.a2 ?? 0);
            const rule = Number(val.rule ?? 0);

            return { locus, a1, a2, rule } as GeneRow;
          })
          .filter(Boolean) as GeneRow[];

        if (!aborted) setGenes(rows);
      } catch (e) {
        console.error("Failed to load genes:", e);
        if (!aborted) setGenes([]);
      } finally {
        if (!aborted) setLoadingGenes(false);
      }
    }

    loadGenes();
    return () => {
      aborted = true;
    };
  }, [client, toki.id]);
  const { executeTx } = useTxRefetch();
  const handleRegister = async () => {
    const priceValue = price.trim();
    const feeValue = fee.trim();

    if (priceValue && (isNaN(Number(priceValue)) || Number(priceValue) <= 0)) {
      setError("If provided, price must be a valid positive number (in SUI).");
      return;
    }
    if (!feeValue || isNaN(Number(feeValue)) || Number(feeValue) < 0) {
      setError("Please enter a valid, non-negative fee (in SUI).");
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const priceInMist = priceValue ? suiToMist(priceValue) : null;
      const feeInMist = suiToMist(feeValue);
      const geneInfo = JSON.stringify(toki.phenotype ?? {});

      await executeTx(
        async (tx) => {
          tx.moveCall({
            target: `${PACKAGE_ID}::farm::register`,
            arguments: [
              tx.object(FARM_ID),
              tx.object(toki.id),
              tx.pure.u64(feeInMist),
              tx.pure.option("u64", priceInMist),
              tx.pure.string(geneInfo),
            ],
          });
        },
        {
          // 전역적으로 모든 suiClient 쿼리 invalidate (기본 true)
          invalidateAllSuiClientQueries: true,
          // 혹시 특정 쿼리만 확실히 재조회하고 싶다면 추가
          extraInvalidateKeys: [
            { queryKey: ["suiClient", "getOwnedObjects"] },
            // { queryKey: ["suiClient", "getDynamicFields", { parentId: "..." }] },
          ],
        }
      );

      onClose();
      router.push("/farm");
    } catch (e: any) {
      setError(e?.message || "Registration failed.");
    } finally {
      setIsRegistering(false);
    }
  };

  // locus → 파츠명 매핑 및 표시용 도우미
  const locusMap: (keyof typeof PARTS_CATALOG)[] = [
    "base",
    "ears",
    "eyes",
    "mouth",
  ];
  const getAlleleName = (part: keyof typeof PARTS_CATALOG, index: number) => {
    const fileName = PARTS_CATALOG[part]?.[index] ?? "N/A";
    return fileName.replace(`${part}_`, "").replace(".png", "");
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto aspect-square w-full max-w-[300px]">
          {toki.imageUrl && !toki.imageUrl.startsWith("https://") ? (
            <Image
              src={toki.imageUrl}
              alt={toki.id}
              width={280}
              height={280}
              className="h-auto w-full rounded-lg object-contain"
            />
          ) : (
            <TokiPreview phenotype={toki.phenotype} size={280} />
          )}
        </div>

        <div className="p-2">
          <h3 className="mb-4 text-4xl font-bold text-emerald-900">
            {toki.name ?? `Toki #${toki.id.slice(0, 6)}`}
          </h3>

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

          {/* ✅ Genes Table (farm/page.tsx 스타일) */}
          <div className="mt-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-emerald-900">
                Genes
              </div>
              {loadingGenes && (
                <div className="text-xs text-gray-600">Loading genes…</div>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-emerald-50 text-emerald-900">
                  <tr>
                    <th className="px-3 py-2">Locus</th>
                    <th className="px-3 py-2">A1</th>
                    <th className="px-3 py-2">A2</th>
                    <th className="px-3 py-2">Rule</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900">
                  {genes.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-600" colSpan={4}>
                        {loadingGenes ? "—" : "No genes found"}
                      </td>
                    </tr>
                  ) : (
                    genes
                      .sort((a, b) => a.locus - b.locus)
                      .map((g) => {
                        const partName = locusMap[g.locus];
                        return (
                          <tr key={g.locus} className="even:bg-gray-50">
                            <td className="px-3 py-2 capitalize">{partName}</td>
                            <td className="px-3 py-2 capitalize">
                              {getAlleleName(partName, g.a1)}
                            </td>
                            <td className="px-3 py-2 capitalize">
                              {getAlleleName(partName, g.a2)}
                            </td>
                            <td className="px-3 py-2">
                              {g.rule === 0 ? "Random" : "Dominant"}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 등록 폼 */}
          <div className="mt-6 border-t pt-4">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800">
              Register for Sale
            </h4>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="price"
                  className="block text-lg font-medium text-black"
                >
                  Price (SUI) - Optional
                </label>
                <div className="relative mt-1 rounded-md shadow-sm">
                  <input
                    type="number"
                    id="price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="block w-full rounded-md border-gray-300 pr-12 focus:border-emerald-500 focus:ring-emerald-500 sm:text-lg font-bold text-emerald-800 placeholder:text-gray-400"
                    placeholder="Leave empty if not for sale."
                    min="0"
                    step="0.000000001"
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
                  Fee (SUI)
                </label>
                <div className="relative mt-1 rounded-md shadow-sm">
                  <input
                    type="number"
                    id="fee"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="block w-full rounded-md border-gray-300 focus:border-emerald-500 focus:ring-emerald-500 sm:text-lg font-bold text-emerald-800"
                    placeholder="e.g., 0.1"
                    aria-describedby="fee-description"
                    min="0"
                    step="0.000000001"
                  />
                </div>
                <p
                  className="mt-1 text-base text-gray-800"
                  id="fee-description"
                >
                  A breeding fee others pay when borrowing this Toki.
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

// ============== 메인 페이지 ==============
export default function MyPage() {
  const account = useCurrentAccount();
  const [selectedToki, setSelectedToki] = useState<TokiView | null>(null);

  // 내 지갑의 Toki들 조회
  const { data, isLoading, isError, refetch } = useSuiClientQuery(
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
      refetchOnMount: "always",
    }
  );

  const items = (data?.data ?? []).map((it: any) => it.data).filter(Boolean);
  const myTokis: TokiView[] = items.map(extractTokiView);

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
