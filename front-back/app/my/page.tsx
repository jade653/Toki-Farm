"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClientQuery,
} from "@mysten/dapp-kit";

const TOKI_TYPE =
  "0x4b8996ff1a400d34a0913c22f378a3a4e6219274f9aaec8fe5dbb19f515ac1f1::creature::Toki";

// 원하는 형태로 가공
function extractTokiView(o: any) {
  const fields = o?.content?.fields ?? {};
  const phenotypeFields = fields?.phenotype?.fields ?? null;

  return {
    id: o?.objectId as string,
    imageUrl: fields?.image_url ?? null,
    parentA: fields?.parent_a ?? null,
    parentB: fields?.parent_b ?? null,
    phenotype: phenotypeFields
      ? {
          ear: phenotypeFields.ear,
          eye: phenotypeFields.eye,
          mouth: phenotypeFields.mouth,
        }
      : null,
  };
}

export default function MyPage() {
  const account = useCurrentAccount();

  // 훅은 항상 호출
  const { data, isLoading, isError } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address!,
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

  const items = (data?.data ?? []).map((it: any) => it.data);
  const myTokis = items.map(extractTokiView);

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
    <section>
      <h2 className="mb-4 text-2xl font-bold text-emerald-900">My Tokis</h2>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {myTokis.map((t) => (
          <li key={t.id} className="rounded-xl border p-3">
            {/* 이미지 */}
            {t.imageUrl ? (
              <Image
                src={t.imageUrl}
                alt={t.id}
                width={320}
                height={320}
                className="h-auto w-full rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-48 place-items-center rounded-lg bg-gray-100 text-sm text-gray-500">
                no image
              </div>
            )}

            {/* 기본 정보 */}
            <div className="mt-3 text-sm text-emerald-100 break-all">
              Toki ID: {t.id}
            </div>
            <div className="mt-1 text-sm">
              <div>
                <span className="font-medium">Parent A:</span>{" "}
                <span className="break-all">{t.parentA ?? "-"}</span>
              </div>
              <div>
                <span className="font-medium">Parent B:</span>{" "}
                <span className="break-all">{t.parentB ?? "-"}</span>
              </div>
            </div>

            {/* 페노타입 */}
            {t.phenotype && (
              <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
                <div className="font-medium mb-1">Phenotype</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>Ear: {t.phenotype.ear}</div>
                  <div>Eye: {t.phenotype.eye}</div>
                  <div>Mouth: {t.phenotype.mouth}</div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
