"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import TokiCard from "@/components/TokiCard";

type ListingItem = { objectId: string; name: string };

const FARM_ID =
  "0x21e6647695577cbb73dbb5d31e50f1c0a21719be1b9033f3714fc74d5cd2ec5b"; // Shared Farm object id
const PACKAGE_ID =
  "0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178"; // 배포 패키지 id
const PAIR_TARGET =
  "0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178::farm::pair_selected"; // 네 실제 함수로 수정

export default function FarmPage() {
  const router = useRouter();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

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

    async function loadFarm() {
      try {
        setLoading(true);
        setError(null);

        // 1) Dynamic field 목록(키들)
        const fields = await client.getDynamicFields({
          parentId: FARM_ID,
          limit: 100,
        });

        // 2) 각 키로 실제 오브젝트 조회
        const objects = await Promise.all(
          (fields.data ?? []).map(async (f) => {
            const obj = await client.getDynamicFieldObject({
              parentId: FARM_ID,
              name: f.name, // 키 그대로
            });
            const data = obj.data as any;
            const content = data?.content as any;
            const objectId = data?.objectId as string;

            const display = data?.display?.data ?? {};
            const fieldsAny = content?.fields ?? {};
            const name =
              display.name ??
              display.title ??
              fieldsAny.name ??
              fieldsAny.title ??
              objectId;

            return { objectId, name } as ListingItem;
          })
        );

        if (!aborted) setListings(objects);
      } catch (e: any) {
        if (!aborted) setError(e?.message ?? "Failed to load farm listings");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    loadFarm();
    return () => {
      aborted = true;
    };
  }, [client]);

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
    if (!canPair) return;

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
        target: PAIR_TARGET, // e.g., `${PACKAGE_ID}::farm::pair_selected`
        arguments: [tx.object(FARM_ID), tx.object(a), tx.object(b)],
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
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {listings.map((l) => (
              <li key={l.objectId} className="contents">
                <TokiCard
                  title={l.name}
                  subtitle={"Ancestor"}
                  selected={selected.includes(l.objectId)}
                  onClick={() => toggleSelect(l.objectId)}
                />
              </li>
            ))}
          </ul>

          <p className="text-sm text-gray-600">
            Select <span className="font-semibold">two</span> ancestors and
            press <span className="font-semibold">Pair Tokis</span>.
          </p>
        </>
      )}
    </section>
  );
}
