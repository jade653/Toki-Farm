// utils/renderToki.ts
// 'use client'  // 클라이언트 전용이면 주석 해제

export type PartKey = "base" | "ears" | "eyes" | "mouth";
export type PhenotypeU8 = Partial<Record<PartKey, number>>;
export type PartSrcs = Partial<Record<PartKey, string>>;

/** u8 → 파일명 매핑 */
export const PARTS_CATALOG: Record<PartKey, Record<number, string>> = {
  base: {
    0: "base_basic.png",
    1: "base_dancing.png",
  },
  ears: {
    0: "ears_short.png",
    1: "ears_long.png",
  },
  eyes: {
    0: "eyes_basic.png",
    1: "eyes_angry.png",
    2: "eyes_sleepy.png",
    3: "eyes_smile.png",
  },
  mouth: {
    0: "mouth_dot.png",
    1: "mouth_angry.png",
    2: "mouth_kiss.png",
    3: "mouth_surprised.png",
  },
};

const LAYER_ORDER: PartKey[] = ["base", "ears", "eyes", "mouth"];

// 이미지 로더 + 캐시
const _imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  if (_imgCache.has(src)) return _imgCache.get(src)!;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  }).then(async (img) => {
    try {
      if (img.decode) await img.decode();
    } catch {}
    return img;
  });

  _imgCache.set(src, p);
  return p;
}

/** u8 표현형 → 브라우저 경로로 변환 (기본 basePath는 /parts/) */
export function resolvePartSrcsFromU8(
  pheno: PhenotypeU8,
  basePath = "/parts/"
): PartSrcs {
  const parts: PartSrcs = {};
  for (const key of LAYER_ORDER) {
    const idx = pheno[key];
    if (idx === undefined) continue;
    const file = PARTS_CATALOG[key][idx];
    if (!file) continue;
    parts[key] = `${basePath.replace(/\/?$/, "/")}${file}`;
  }
  return parts;
}

/** 경로들을 받아 캔버스에 합성해서 반환
 *  @param size 최종 PNG 해상도(기본 960)
 *  @param background 'transparent' 또는 CSS color 문자열(기본 'transparent')
 */
export async function renderTokiFromSrcs(
  parts: PartSrcs,
  size = 960,
  background: "transparent" | string = "transparent"
): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined")
    throw new Error("renderToki must run in the browser.");

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  for (const key of LAYER_ORDER) {
    const src = parts[key];
    if (!src) continue;
    const img = await loadImage(src);
    ctx.drawImage(img, 0, 0, size, size);
  }

  return canvas;
}

/** u8 표현형을 받아 바로 합성
 *  @param basePath 기본 '/parts/'
 *  @param size 기본 960
 *  @param background 기본 'transparent'
 */
export async function renderTokiFromU8(
  pheno: PhenotypeU8,
  basePath = "/parts/",
  size = 960,
  background: "transparent" | string = "transparent"
): Promise<HTMLCanvasElement> {
  const parts = resolvePartSrcsFromU8(pheno, basePath);
  return renderTokiFromSrcs(parts, size, background);
}

/** 최종 PNG dataURL */
export async function renderTokiPngDataURLFromU8(
  pheno: PhenotypeU8,
  basePath = "/parts/",
  size = 960,
  background: "transparent" | string = "transparent"
): Promise<string> {
  const canvas = await renderTokiFromU8(pheno, basePath, size, background);
  return canvas.toDataURL("image/png");
}

/** 최종 PNG Blob (업로드용) */
export async function renderTokiPngBlobFromU8(
  pheno: PhenotypeU8,
  basePath = "/parts/",
  size = 960,
  background: "transparent" | string = "transparent"
): Promise<Blob> {
  const canvas = await renderTokiFromU8(pheno, basePath, size, background);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/png")
  );
}

/** 최종 PNG File (FormData 업로드 등) */
export async function renderTokiPngFileFromU8(
  pheno: PhenotypeU8,
  filename = "toki.png",
  basePath = "/parts/",
  size = 960,
  background: "transparent" | string = "transparent"
): Promise<File> {
  const blob = await renderTokiPngBlobFromU8(pheno, basePath, size, background);
  return new File([blob], filename, { type: "image/png" });
}
