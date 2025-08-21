"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClientQuery,
} from "@mysten/dapp-kit";

const TOKI_TYPE =
  "0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178::creature::Toki";

// pages/my-page.tsx (혹은 해당 파일 상단)
import { useEffect, useState, useMemo } from "react";
import { renderTokiPngDataURLFromU8 } from "@/utils/renderToki";

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

// 토키 상세 정보 모달
function TokiDetailModal({
  toki,
  onClose,
}: {
  toki: TokiView;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-square w-full">
          {toki.imageUrl ? (
            <Image
              src={toki.imageUrl}
              alt={toki.id}
              width={320}
              height={320}
              className="h-auto w-full rounded-lg object-cover"
            />
          ) : (
            <TokiPreview phenotype={toki.phenotype} size={320} />
          )}
        </div>
        <div className="p-2">
          <h3 className="mb-3 text-xl font-bold text-emerald-900">
            {toki.name ?? `Toki #${toki.id.slice(0, 6)}`}
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <div className="font-semibold text-gray-500">ID</div>
              <p className="break-all text-gray-800">{toki.id}</p>
            </div>
            <div>
              <div className="font-semibold text-gray-500">Parent A</div>
              <p className="break-all text-gray-800">{toki.parentA ?? "-"}</p>
            </div>
            <div>
              <div className="font-semibold text-gray-500">Parent B</div>
              <p className="break-all text-gray-800">{toki.parentB ?? "-"}</p>
            </div>
            {toki.phenotype && (
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-900">
                <div className="font-medium mb-1">Phenotype</div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  <div>Base: {toki.phenotype.base}</div>
                  <div>Ear: {toki.phenotype.ear}</div>
                  <div>Eye: {toki.phenotype.eye}</div>
                  <div>Mouth: {toki.phenotype.mouth}</div>
                </div>
              </div>
            )}
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
