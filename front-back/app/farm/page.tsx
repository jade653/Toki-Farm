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
import { renderTokiPngDataURLFromU8 } from "@/utils/renderToki";

type PhenotypeView = {
  base: number;
  ear: number;
  eye: number;
  mouth: number;
};

type ListingItem = {
  listingId: string;
  name: string;
  imageUrl?: string | null;
  phenotype?: PhenotypeView | null;
};

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
  if (toki.imageUrl) {
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

export default function FarmPage() {
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

  const canPair = useMemo(
    () => account && selected.length === 2,
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
        console.log("Dynamic fields:", fieldsPage.data);

        // 3) Dynamic Field 객체들의 ID 목록을 만듭니다.
        const dynamicFieldObjectIds = fieldsPage.data.map(
          (field) => field.objectId
        );

        if (dynamicFieldObjectIds.length === 0) {
          setListings([]);
          setLoading(false);
          return;
        }

        // 4) 각 ID로 Dynamic Field 객체('Field<ID, Listing>')를 가져옵니다.
        // multiGetObjects를 사용하면 한번의 요청으로 모두 가져올 수 있어 더 효율적입니다.
        const fieldObjects = await client.multiGetObjects({
          ids: dynamicFieldObjectIds,
          options: { showContent: true },
        });

        // 5) 가져온 객체들의 내용을 파싱하여 화면에 표시할 데이터로 변환합니다.
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

          // Field<ID, Listing> 객체는 'name'(키)과 'value'(값) 필드를 가집니다.
          const dynamicField = fieldObject.content.fields as any;
          const listingStruct = dynamicField.value.fields; // 'value'가 실제 Listing 구조체입니다.

          // Listing 객체 자체의 ID로, 선택 및 페어링에 사용됩니다.
          const listingId = listingStruct.id.id;

          // Listing 구조체 안의 'nft' 필드가 Toki 객체입니다.
          const tokiFields = listingStruct.nft.fields;
          if (!tokiFields) {
            return null;
          }

          // Toki 객체 안의 'phenotype' 필드를 사용합니다.
          const phenotypeFields = tokiFields.phenotype?.fields;
          const phenotype: PhenotypeView | null = phenotypeFields
            ? {
                base: phenotypeFields.base,
                ear: phenotypeFields.ear,
                eye: phenotypeFields.eye,
                mouth: phenotypeFields.mouth,
              }
            : null;

          return {
            listingId: listingId,
            name: tokiFields.name ?? `Toki #${tokiFields.id.id.slice(0, 6)}`,
            imageUrl: tokiFields.image_url ?? null,
            phenotype: phenotype,
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

  // 카드 선택: 최대 2개
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  // ▶️ 트랜잭션 템플릿: 네 Move 함수에 맞게 target/arguments만 수정
  const handlePair = async () => {
    if (!canPair || !packageId || !farmId) return;

    try {
      setMsg(null);
      // 선택한 두 listing
      const [a, b] = selected;

      const tx = new Transaction();

      // 예시) shared Farm + 두 listing 오브젝트를 전달
      //  - shared는 tx.object(FARM_ID)
      //  - listing은 보통 owned/shared object 참조: tx.object(listingId)
      //  - 실제 함수 시그니처(coin, fee, type args 등)에 맞게 수정 필요
      tx.moveCall({
        target: `${packageId}::farm::pair_selected`,
        arguments: [tx.object(farmId), tx.object(a), tx.object(b)],
      });

      const res = await signAndExecute({ transaction: tx });
      setMsg(`Pair success! digest: ${res.digest}`);

      // 성공 후 내 페이지로 이동 (필요 시 약간의 delay)
      setTimeout(() => router.push("/my"), 700);
    } catch (e: any) {
      setMsg(null);
      setError(e?.message ?? "Pair transaction failed");
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-emerald-900">Farm</h2>

        <button
          onClick={handlePair}
          disabled={!canPair}
          className={`rounded-xl px-4 py-2 font-semibold text-white shadow transition ${
            canPair
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-emerald-300 cursor-not-allowed"
          }`}
        >
          Pair Tokis
        </button>
      </div>

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
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {listings.map((item) => (
              <li key={item.listingId}>
                <button
                  type="button"
                  onClick={() => toggleSelect(item.listingId)}
                  className={`group w-full cursor-pointer rounded-2xl border p-2 text-center shadow-sm transition ${
                    selected.includes(item.listingId)
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
                  <div className="text-xs text-gray-600">Ancestor</div>
                </button>
              </li>
            ))}
          </ul>

          <p className="text-sm text-gray-600">
            Select <span className="font-semibold">two</span> ancestors and
            press <span className="font-semibold">Pair Tokis</span>.
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-700">
            No Tokis found in the farm. Register your Toki on the 'My Tokis'
            page!
          </p>
        </div>
      )}
    </section>
  );
}
