"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "../providers";
import { renderTokiPngDataURLFromU8, PARTS_CATALOG } from "@/utils/renderToki";
import { useQueryClient } from "@tanstack/react-query";

type PhenotypeView = {
  base: number;
  ear: number;
  eye: number;
  mouth: number;
};

type ListingItem = {
  // ✅ 테이블 키로 쓰일 값: 반드시 'Toki Object ID'
  listingId: string;
  name: string;
  imageUrl?: string | null;
  phenotype?: PhenotypeView | null;
  // ✅ u64 수수료 / 판매가 (JSON에선 보통 string)
  fee?: string; // breed 대여료
  price?: string | null; // 판매가 (Option)
  owner?: string; // 좌/우 분리
  // 모달 표시에 쓰기 위한 원본 필드들(parent_a, parent_b, phenotype, genes 등)
  tokiFields?: any;
};

type GeneRow = {
  locus: number;
  a1: number;
  a2: number;
  rule: number;
};

// 안전한 u64(Option<u64> 포함) 파서
function parseU64Loose(u: any): string | null {
  // 순서대로 최대한 폭넓게 시도
  const candidates = [
    u?.fields?.some,
    u?.some,
    u?.fields?.value,
    u?.value,
    typeof u === "string" || typeof u === "number" ? u : null,
  ];
  const v = candidates.find((x) => x !== undefined && x !== null);
  return v != null ? String(v) : null;
}

// Helper function to convert MIST to SUI for display
function mistToSui(mist: string | null | undefined): string {
  if (mist === null || mist === undefined) return "N/A";
  try {
    const mistBigInt = BigInt(mist);
    // Using Number for division is fine for display purposes
    const sui = Number(mistBigInt) / 1_000_000_000;
    return `${sui.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 9,
    })} SUI`;
  } catch (e) {
    return "-";
  }
}

function TokiPreview({
  phenotype,
  size = 320,
}: {
  phenotype?: PhenotypeView | null;
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
  }, [phenoU8]);

  if (!src) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-lg bg-gray-100 text-sm text-gray-500">
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

function TokiImage({
  toki,
  size,
}: {
  toki: { imageUrl?: string | null; phenotype?: PhenotypeView | null };
  size: number;
}) {
  if (toki.imageUrl && !toki.imageUrl.startsWith("https://")) {
    return (
      <Image
        src={toki.imageUrl}
        alt="toki"
        width={size}
        height={size}
        className="h-auto w-full rounded-lg object-cover"
      />
    );
  }
  return <TokiPreview phenotype={toki.phenotype} size={size} />;
}

// ────────────────────────────────────────────────────────────
// 모달 (Phenotype / Genes 테이블 + Price/Fee + Buy)
// ────────────────────────────────────────────────────────────
function TokiModal({
  open,
  onClose,
  item,
  isMine,
  onUnlist,
  onBuy,
  genes,
  loadingGenes,
}: {
  open: boolean;
  onClose: () => void;
  item: ListingItem | null;
  isMine: boolean;
  onUnlist: (id: string) => void;
  onBuy: (id: string, price: string) => void;
  genes: GeneRow[];
  loadingGenes: boolean;
}) {
  if (!open || !item) return null;
  const fields = item.tokiFields;

  const parentA =
    fields?.parent_a ??
    (fields?.parent_a?.fields?.vec?.length
      ? fields.parent_a.fields.vec[0]
      : null) ??
    "None";
  const parentB =
    fields?.parent_b ??
    (fields?.parent_b?.fields?.vec?.length
      ? fields.parent_b.fields.vec[0]
      : null) ??
    "None";

  const ph = fields?.phenotype?.fields ?? null;

  // 가격/수수료 표시 (MIST -> SUI 변환)
  const priceStr = item.price ?? null;
  const feeStr = item.fee ?? "-";
  const displayPrice = priceStr ? mistToSui(priceStr) : "Not for Sale";
  const displayFee = mistToSui(feeStr);

  const showBuy = !isMine && !!priceStr;

  // 유전자 숫자 -> 이름 변환 로직
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[720px] max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-48 shrink-0">
            <TokiImage toki={item} size={192} />
          </div>

          <div className="min-w-0 grow">
            <h3 className="mb-2 truncate text-xl font-bold text-emerald-900">
              {item.name}
            </h3>

            {/* Price / Fee */}
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border p-3 text-gray-900">
                <div className="text-xs text-gray-600">Price</div>
                <div className="font-semibold">{displayPrice}</div>
              </div>
              <div className="rounded-lg border p-3 text-gray-900">
                <div className="text-xs text-gray-600">Breed Fee</div>
                <div className="font-semibold">{displayFee}</div>
              </div>
              <div className="rounded-lg border p-3 text-gray-900">
                <div className="text-xs text-gray-600">Owner</div>
                <div className="truncate font-semibold">
                  {String(item.owner ?? "-")}
                </div>
              </div>
            </div>

            {/* Parents */}
            <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <div className="text-gray-700">Parent A</div>
                <div className="truncate font-medium text-gray-900">
                  {String(parentA)}
                </div>
              </div>
              <div>
                <div className="text-gray-700">Parent B</div>
                <div className="truncate font-medium text-gray-900">
                  {String(parentB)}
                </div>
              </div>
            </div>

            {/* Phenotype Table */}
            <div className="mb-4">
              <div className="mb-2 text-sm font-semibold text-emerald-900">
                Phenotype
              </div>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="px-3 py-2">Base</th>
                      <th className="px-3 py-2">Ear</th>
                      <th className="px-3 py-2">Eye</th>
                      <th className="px-3 py-2">Mouth</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-900">
                    <tr>
                      <td className="px-3 py-2 capitalize">
                        {ph ? getAlleleName("base", ph.base) : "-"}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {ph ? getAlleleName("ears", ph.ear) : "-"}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {ph ? getAlleleName("eyes", ph.eye) : "-"}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {ph ? getAlleleName("mouth", ph.mouth) : "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Genes Table */}
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
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          {isMine && (
            <button
              onClick={() => onUnlist(item.listingId)}
              className="rounded-xl bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-600"
            >
              Unlist
            </button>
          )}
          {!isMine && priceStr && (
            <button
              onClick={() => onBuy(item.listingId, priceStr)}
              className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
            >
              Buy
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FarmPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const farmId = useNetworkVariable("farmId");
  const packageId = useNetworkVariable("packageId");

  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 선택 모드 상태 (Pair 토글)
  const [selectMode, setSelectMode] = useState(false);

  // 모달 상태
  const [modalItem, setModalItem] = useState<ListingItem | null>(null);
  const [genesRows, setGenesRows] = useState<GeneRow[]>([]);
  const [loadingGenes, setLoadingGenes] = useState(false);

  const canPair = useMemo(
    () => !!account && selected.length === 2,
    [account, selected.length]
  );

  // Shared Farm의 Dynamic Fields 읽기 → Listing 목록화
  useEffect(() => {
    let aborted = false;

    if (!farmId) {
      return;
    }

    async function loadFarm() {
      try {
        setLoading(true);
        setError(null);

        // 1) Farm 객체를 가져와서 'listings' 테이블의 ID를 얻습니다.
        const farmObject = await client.getObject({
          id: farmId,
          options: { showContent: true },
        });
        if (farmObject.data?.content?.dataType !== "moveObject") {
          throw new Error("Farm object not found or is not a Move object.");
        }
        const listingsTableId =
          farmObject.data.content.fields.listings.fields.id.id;

        // 2) 'listings' 테이블에서 Dynamic field 목록을 가져옵니다.
        const fieldsPage = await client.getDynamicFields({
          parentId: listingsTableId,
        });

        // 3) Dynamic Field 객체들의 ID 목록
        const dynamicFieldObjectIds = fieldsPage.data.map(
          (field) => field.objectId
        );

        if (dynamicFieldObjectIds.length === 0) {
          if (!aborted) {
            setListings([]);
            setLoading(false);
          }
          return;
        }

        // 4) Field<ID, Listing> 객체들을 일괄 조회
        const fieldObjects = await client.multiGetObjects({
          ids: dynamicFieldObjectIds,
          options: { showContent: true },
        });

        // 5) 화면 표시용으로 변환
        const parsedListings = fieldObjects.map((fieldObjectResponse) => {
          const fieldObject = fieldObjectResponse.data;

          if (
            !fieldObject ||
            !fieldObject.content ||
            fieldObject.content.dataType !== "moveObject"
          ) {
            console.error(
              `Invalid dynamic field object received:`,
              fieldObjectResponse
            );
            return null;
          }

          // Field<ID, Listing> => { name, value }
          const dynamicField = fieldObject.content.fields as any;
          const listingStruct = dynamicField.value.fields; // 실제 Listing

          // Listing.nft 가 Some(Toki)인 것만 노출
          const nftOpt = listingStruct.nft;
          const tokiFields = nftOpt?.fields;
          if (!tokiFields) return null; // None 이면 제외

          // ✅ 테이블 키 = Toki Object ID (register에서 object::id(&nft)로 키를 넣었음)
          const tokiId: string = tokiFields.id.id;

          const phenotypeFields = tokiFields.phenotype?.fields;
          const phenotype: PhenotypeView | null = phenotypeFields
            ? {
                base: phenotypeFields.base,
                ear: phenotypeFields.ear,
                eye: phenotypeFields.eye,
                mouth: phenotypeFields.mouth,
              }
            : null;

          // u64 fee / Option<u64> price 파싱
          const fee = parseU64Loose(listingStruct.fee) ?? undefined;
          const price = parseU64Loose(listingStruct.price); // null 가능

          return {
            listingId: tokiId,
            name: tokiFields.name ?? `Toki #${tokiId.slice(0, 6)}`,
            imageUrl: tokiFields.image_url ?? null,
            phenotype,
            fee,
            price,
            owner: listingStruct.owner,
            tokiFields,
          } as ListingItem;
        });

        const validListings = parsedListings.filter(Boolean) as ListingItem[];
        if (!aborted) {
          setListings(validListings);
        }
      } catch (e: any) {
        if (!aborted) {
          setError(e?.message ?? "Failed to load farm listings");
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    }
    loadFarm();
    return () => {
      aborted = true;
    };
  }, [client, farmId]);

  // 카드 선택: 최대 2개 (선택 모드일 때만 동작)
  const toggleSelect = (id: string) => {
    if (!selectMode) return; // 선택 모드 아니면 무시
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  // 카드 클릭 핸들러: 선택 모드면 선택/해제, 아니면 모달 열기
  const handleCardClick = (item: ListingItem) => {
    if (selectMode) {
      toggleSelect(item.listingId);
      return;
    }
    openModal(item);
  };

  // ── 모달 열기 시 genes 테이블 동적 필드 조회 ──
  const openModal = async (item: ListingItem) => {
    setModalItem(item);
    setGenesRows([]);
    if (!item?.tokiFields?.genes?.fields?.id?.id) return;

    const genesTableId = item.tokiFields.genes.fields.id.id as string;

    try {
      setLoadingGenes(true);

      // genes: Table<u8, GenePair> 의 Dynamic Fields 조회
      const genesDf = await client.getDynamicFields({ parentId: genesTableId });
      if (genesDf.data.length === 0) {
        setGenesRows([]);
        return;
      }

      const geneFieldObjectIds = genesDf.data.map((f) => f.objectId);
      const geneFieldObjects = await client.multiGetObjects({
        ids: geneFieldObjectIds,
        options: { showContent: true },
      });

      const rows: GeneRow[] = geneFieldObjects
        .map((resp) => {
          const fo = resp.data?.content?.fields as any;
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

          // value = GenePair
          const val = fo.value?.fields ?? fo.value ?? null;
          if (!val) return null;

          const a1 = Number(val.a1 ?? 0);
          const a2 = Number(val.a2 ?? 0);
          const rule = Number(val.rule ?? 0);

          return { locus, a1, a2, rule } as GeneRow;
        })
        .filter(Boolean) as GeneRow[];

      setGenesRows(rows);
    } catch (err) {
      console.error("Failed to load genes:", err);
      setGenesRows([]);
    } finally {
      setLoadingGenes(false);
    }
  };

  // pair_from_listings 호출 전용 (기존 로직 유지: fee 기반 코인 분할)
  const handlePair = async () => {
    if (!packageId || !farmId) return;

    try {
      setError(null);
      setMsg("Pairing…");

      // ✅ selected[*] 는 반드시 'Toki ID'(테이블 키)
      const [idA, idB] = selected;
      if (!idA || !idB || idA === idB) {
        throw new Error("Please select two different Tokis.");
      }

      // 선택된 항목의 fee (MIST, u64). 모르면 1 MIST로 최소 처리.
      const itemA = listings.find((l) => l.listingId === idA);
      const itemB = listings.find((l) => l.listingId === idB);
      const feeA = BigInt(itemA?.fee ?? "1");
      const feeB = BigInt(itemB?.fee ?? "1");

      const tx = new Transaction();

      // pay_a, pay_b 로 쓸 코인 두 개 생성 (가스에서 분할, 단위=MIST)
      const [payA, payB] = tx.splitCoins(tx.gas, [
        tx.pure.u64(feeA),
        tx.pure.u64(feeB),
      ]);

      // farm::pair_from_listings(
      //   &mut Farm, id_a: ID, pay_a: Coin<SUI>, id_b: ID, pay_b: Coin<SUI>, &mut TxContext
      // )
      tx.moveCall({
        target: `${packageId}::farm::pair_from_listings`,
        arguments: [
          tx.object(farmId), // &mut Farm (shared)
          tx.pure.id(idA), // Toki ID (테이블 키)
          payA, // Coin<SUI>
          tx.pure.id(idB), // Toki ID (테이블 키)
          payB, // Coin<SUI>
        ],
      });

      await signAndExecute({
        transaction: tx,
      });

      setMsg("Paired! Check your wallet activity / events.");
      setSelected([]);
      setSelectMode(false); // ✅ 실행 후 선택 모드 종료
      setTimeout(() => router.push("/my"), 700);
    } catch (e: any) {
      setMsg(null);
      setError(e?.message ?? "Pair transaction failed");
    }
  };

  // ✅ buy 호출
  const handleBuy = async (nftId: string, priceStr: string) => {
    if (!packageId || !farmId) return;

    try {
      setError(null);
      setMsg("Buying…");

      const price = BigInt(priceStr); // u64 string → BigInt
      const tx = new Transaction();

      // 결제 코인 생성 (가스에서 분할, 단위=MIST)
      const pay = tx.splitCoins(tx.gas, [tx.pure.u64(price)])[0];

      // farm::buy(&mut Farm, nft_id: ID, pay: Coin<SUI>, &mut TxContext)
      tx.moveCall({
        target: `${packageId}::farm::buy`,
        arguments: [tx.object(farmId), tx.pure.id(nftId), pay],
      });

      await signAndExecute({
        transaction: tx,
      });

      setMsg("Purchased! Check your wallet activity / events.");
      setModalItem(null);
      await queryClient.invalidateQueries({
        queryKey: ["suiClient", "getOwnedObjects"],
      });

      setTimeout(() => router.push("/my"), 700);
    } catch (e: any) {
      setMsg(null);
      setError(e?.message ?? "Buy transaction failed");
    }
  };

  // modal에서 unlist 버튼 클릭 시 (기존 로직 유지)
  const handleUnlist = async (nftId: string) => {
    if (!packageId || !farmId) return;

    try {
      setError(null);
      setMsg("Unlisting…");

      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::farm::unlist`,
        arguments: [tx.object(farmId), tx.pure.id(nftId)],
      });

      await signAndExecute({
        transaction: tx,
      });

      setMsg("Unlisted! Check your wallet activity / events.");
      await queryClient.invalidateQueries({
        queryKey: ["suiClient", "getOwnedObjects"],
      });

      setTimeout(() => router.push("/my"), 700);
    } catch (e: any) {
      setMsg(null);
      setError(e?.message ?? "Pair transaction failed");
    }
  };

  // 좌/우 분리
  const myListings = listings.filter((l) => l.owner === account?.address);
  const otherListings = listings.filter((l) => l.owner !== account?.address);

  // Pair 버튼 클릭: 선택 모드 토글/실행
  const onClickPairButton = () => {
    if (!selectMode) {
      setSelected([]);
      setSelectMode(true);
      setMsg("Selection mode enabled. Choose two Tokis to pair.");
      return;
    }
    if (selected.length === 2) {
      handlePair();
    }
  };

  const pairBtnDisabled = selectMode ? selected.length !== 2 : false;
  const pairBtnLabel = selectMode
    ? `Pair Tokis (${selected.length}/2)`
    : "Pair Tokis";

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-emerald-900">Farm</h2>

        <button
          onClick={onClickPairButton}
          disabled={pairBtnDisabled}
          className={`rounded-xl px-4 py-2 font-semibold text-white shadow transition ${
            pairBtnDisabled
              ? "bg-emerald-300 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {pairBtnLabel}
        </button>
      </div>

      {/* Content Area with background */}
      <div className="space-y-6 rounded-2xl bg-white/70 p-6 backdrop-blur-sm">
        {!account && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="mb-2 font-medium">Wallet not connected</div>
            <p>Connect your wallet to create a Toki.</p>
            <div className="mt-3">
              <ConnectButton />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            {error}
          </div>
        )}

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            {msg}
          </div>
        )}

        {loading ? (
          <p className="text-gray-600">Loading farm…</p>
        ) : listings.length > 0 ? (
          <div className="space-y-6">
            {/* 좌/우 2단 레이아웃 */}
            <div className="grid gap-8 md:grid-cols-2">
              {/* 왼쪽: 내가 등록한 NFT */}
              <div>
                <h3 className="mb-3 text-lg font-semibold text-emerald-800">
                  My Listings
                </h3>
                {myListings.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
                    You have no listings here.
                  </div>
                ) : (
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {myListings.map((item) => {
                      const fields = item.tokiFields;
                      const parentA =
                        fields?.parent_a ??
                        (fields?.parent_a?.fields?.vec?.length
                          ? fields.parent_a.fields.vec[0]
                          : null) ??
                        "None";
                      const parentB =
                        fields?.parent_b ??
                        (fields?.parent_b?.fields?.vec?.length
                          ? fields.parent_b.fields.vec[0]
                          : null) ??
                        "None";
                      const isAncestor =
                        parentA === "None" && parentB === "None";

                      return (
                        <li key={item.listingId}>
                          <button
                            type="button"
                            onClick={() => handleCardClick(item)}
                            className={`group w-full cursor-pointer rounded-2xl border bg-white/50 p-2 text-center shadow-sm transition ${
                              selectMode && selected.includes(item.listingId)
                                ? "border-emerald-600 ring-4 ring-emerald-200"
                                : "border-amber-200 hover:border-amber-300"
                            }`}
                          >
                            <div className="transition group-hover:drop-shadow-lg">
                              <TokiImage toki={item} size={320} />
                            </div>
                            <div className="mt-2 font-semibold text-emerald-900">
                              {item.name}
                            </div>
                            {isAncestor && (
                              <div className="text-xs font-semibold text-gray-600">
                                Ancestor
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 오른쪽: 다른 사람 NFT */}
              <div>
                <h3 className="mb-3 text-lg font-semibold text-emerald-800">
                  Others
                </h3>
                {otherListings.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
                    No other listings yet.
                  </div>
                ) : (
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {otherListings.map((item) => {
                      const fields = item.tokiFields;
                      const parentA =
                        fields?.parent_a ??
                        (fields?.parent_a?.fields?.vec?.length
                          ? fields.parent_a.fields.vec[0]
                          : null) ??
                        "None";
                      const parentB =
                        fields?.parent_b ??
                        (fields?.parent_b?.fields?.vec?.length
                          ? fields.parent_b.fields.vec[0]
                          : null) ??
                        "None";
                      const isAncestor =
                        parentA === "None" && parentB === "None";

                      return (
                        <li key={item.listingId}>
                          <button
                            type="button"
                            onClick={() => handleCardClick(item)}
                            className={`group w-full cursor-pointer rounded-2xl border bg-white/50 p-2 text-center shadow-sm transition ${
                              selectMode && selected.includes(item.listingId)
                                ? "border-emerald-600 ring-4 ring-emerald-200"
                                : "border-amber-200 hover:border-amber-300"
                            }`}
                          >
                            <div className="transition group-hover:drop-shadow-lg">
                              <TokiImage toki={item} size={320} />
                            </div>
                            <div className="mt-2 font-semibold text-emerald-900">
                              {item.name}
                            </div>
                            {isAncestor && (
                              <div className="text-xs font-semibold text-gray-600">
                                Ancestor
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <p className="text-sm text-gray-600">
              {selectMode ? (
                <>
                  Select <span className="font-semibold">two</span> ancestors,
                  then press <span className="font-semibold">Pair Tokis</span>.
                </>
              ) : (
                <>
                  Click a card to view details. Press{" "}
                  <span className="font-semibold">Pair Tokis</span> to start
                  selecting.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-gray-700">
              No Tokis found in the farm. Register your Toki
            </p>
          </div>
        )}
      </div>

      {/* 모달 */}
      <TokiModal
        open={!!modalItem}
        onClose={() => setModalItem(null)}
        item={modalItem}
        isMine={modalItem?.owner === account?.address}
        onUnlist={handleUnlist}
        onBuy={handleBuy}
        genes={genesRows}
        loadingGenes={loadingGenes}
      />
    </section>
  );
}
