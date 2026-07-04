"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { trackBrowserPurchase } from "@/lib/meta-browser";
import {
  basePricesByQuantity,
  getAdditionalPhotoAmountCents,
  getFirstExtraAmountCentsFromPricingBaseAmountCents,
} from "@/lib/pricing";

const MAX_PHOTOS = 20;
const DEFAULT_GALLERY_SIZE = 15;
const DEFAULT_PAID_AMOUNT = 7.9;
const DEFAULT_INCLUDED_PHOTOS = 1;
const DEFAULT_FIRST_EXTRA_AMOUNT = 9.9;
const PROFESSIONAL_EXTRA_PRICING: Record<number, number> = {
  4: 9.9,
  5: 14.9,
  6: 19.9,
  7: 24.9,
  8: 29.9,
  9: 29.9,
  10: 29.9,
};

const samplePhotos = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
  id: `photo-${index + 1}`,
  number: index + 1,
  tone: (index * 19 + 8) % 360,
  previewUrl: "",
}));

const videoPricesByQuantity = [0, 19.9, 29.9, 39.9, 49.9, 59.9];

const standardMilestones = [
  { quantity: 1, label: "Incluída" },
  { quantity: 3, label: "Trio" },
  { quantity: 5, label: "Favoritas" },
  { quantity: 10, label: "Ensaio" },
  { quantity: 15, label: "Galeria completa" },
  { quantity: 20, label: "Galeria completa" },
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type DownloadFile = {
  url: string;
  fileName: string;
};

type PhotoDownload = {
  photoId: string;
  number: number;
  url: string;
};

export type GalleryOffer = {
  galleryType: "universal" | "professional";
  paidAmount: number;
  pricingBaseAmount: number;
  extraPhotoPricing: Record<number, number> | null;
  includedPhotos: number;
  gallerySize: number;
  videoPrice: number;
  firstImpressionPackPrice: number;
  newShootPrice: number;
  expressShootPrice: number;
};

export type GalleryPhoto = {
  id: string;
  number: number;
  previewUrl: string;
};

function normalizeOffer(offer?: Partial<GalleryOffer>): GalleryOffer {
  const includedPhotos = Math.min(
    MAX_PHOTOS,
    Math.max(0, Math.round(offer?.includedPhotos ?? DEFAULT_INCLUDED_PHOTOS)),
  );
  const paidAmount = Math.max(0, offer?.paidAmount ?? DEFAULT_PAID_AMOUNT);
  const galleryType = offer?.galleryType ?? "universal";
  const pricingReferenceQuantity = Math.min(
    MAX_PHOTOS - 1,
    Math.max(1, includedPhotos),
  );
  const defaultPricingBaseAmount =
    includedPhotos === 0
      ? DEFAULT_FIRST_EXTRA_AMOUNT
      : DEFAULT_FIRST_EXTRA_AMOUNT *
        (basePricesByQuantity[pricingReferenceQuantity] /
          (basePricesByQuantity[pricingReferenceQuantity + 1] -
            basePricesByQuantity[pricingReferenceQuantity]));
  const pricingBaseAmount = Math.max(
    0.01,
    offer?.pricingBaseAmount ?? defaultPricingBaseAmount,
  );
  const gallerySize = Math.min(
    MAX_PHOTOS,
    Math.max(
      includedPhotos,
      Math.round(offer?.gallerySize ?? DEFAULT_GALLERY_SIZE),
    ),
  );
  const videoPrice = Math.max(0, offer?.videoPrice ?? 19.9);
  const firstImpressionPackPrice = Math.max(
    0,
    offer?.firstImpressionPackPrice ?? 14.9,
  );
  const newShootPrice = Math.max(0, offer?.newShootPrice ?? 7.9);
  const expressShootPrice = Math.max(0, offer?.expressShootPrice ?? 4.9);
  const extraPhotoPricing =
    offer?.extraPhotoPricing ??
    (galleryType === "professional" ? PROFESSIONAL_EXTRA_PRICING : null);

  return {
    galleryType,
    includedPhotos,
    paidAmount,
    pricingBaseAmount,
    extraPhotoPricing,
    gallerySize,
    videoPrice,
    firstImpressionPackPrice,
    newShootPrice,
    expressShootPrice,
  };
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function getPricingBaseAmountCents(offer: GalleryOffer) {
  return Math.max(1, toCents(offer.pricingBaseAmount));
}

function getTotalPhotoAmountCents(offer: GalleryOffer, count: number) {
  if (!count) return 0;
  return (
    toCents(offer.paidAmount) +
    getAdditionalPhotoAmountCents({
      selectedCount: count,
      includedPhotos: offer.includedPhotos,
      paidAmountCents: toCents(offer.paidAmount),
      pricingBaseAmountCents: getPricingBaseAmountCents(offer),
      extraPhotoPricingCents: offer.extraPhotoPricing
        ? Object.fromEntries(
            Object.entries(offer.extraPhotoPricing).map(([count, amount]) => [
              Number(count),
              toCents(amount),
            ]),
          )
        : null,
    })
  );
}

function createMilestones(includedPhotos: number, gallerySize: number) {
  const milestones = standardMilestones.filter(
    (milestone) =>
      milestone.quantity >= includedPhotos &&
      milestone.quantity <= gallerySize,
  );

  if (!milestones.some((milestone) => milestone.quantity === includedPhotos)) {
    if (includedPhotos > 0) {
      milestones.unshift({
        quantity: includedPhotos,
        label: `${includedPhotos} incluídas`,
      });
    }
  } else if (includedPhotos === 0 && milestones[0]) {
    milestones[0] = {
      ...milestones[0],
      label: "1 foto",
    };
  } else {
    milestones[0] = {
      ...milestones[0],
      label:
        includedPhotos === 1 ? "Já incluída" : `${includedPhotos} já incluídas`,
    };
  }

  return milestones;
}

function getVideoPrice(videoCount: number, unitPrice: number) {
  const safeCount = Math.min(MAX_PHOTOS, Math.max(0, Math.round(videoCount)));
  if (!safeCount) return 0;

  if (unitPrice !== 19.9) return safeCount * unitPrice;

  return (
    videoPricesByQuantity[safeCount] ??
    videoPricesByQuantity[5] + (safeCount - 5) * 8.9
  );
}

function createCrc32Table() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const crc32Table = createCrc32Table();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toArrayBuffer(data: Uint8Array) {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

function createZip(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const parts: ArrayBuffer[] = [];
  const centralDirectory: ArrayBuffer[] = [];
  let offset = 0;

  function header(size: number) {
    const buffer = new ArrayBuffer(size);
    return { buffer, view: new DataView(buffer) };
  }

  for (const file of files) {
    const name = encoder.encode(file.name);
    const nameBuffer = toArrayBuffer(name);
    const dataBuffer = toArrayBuffer(file.data);
    const checksum = crc32(file.data);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint16(10, 0, true);
    local.view.setUint16(12, 0, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, file.data.byteLength, true);
    local.view.setUint32(22, file.data.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    local.view.setUint16(28, 0, true);
    parts.push(local.buffer, nameBuffer, dataBuffer);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint16(12, 0, true);
    central.view.setUint16(14, 0, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, file.data.byteLength, true);
    central.view.setUint32(24, file.data.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, 0, true);
    central.view.setUint32(42, offset, true);
    centralDirectory.push(central.buffer, nameBuffer);
    offset += local.buffer.byteLength + name.byteLength + file.data.byteLength;
  }

  const centralDirectorySize = centralDirectory.reduce(
    (size, part) => size + part.byteLength,
    0,
  );
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralDirectorySize, true);
  end.view.setUint32(16, offset, true);
  end.view.setUint16(20, 0, true);

  return new Blob([...parts, ...centralDirectory, end.buffer], {
    type: "application/zip",
  });
}

function AddIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const oneClickUpsellStyles = [
  {
    id: "same",
    title: "Mesmo estilo",
    description: "Mais uma galeria na mesma pegada que já deu certo.",
    theme: "Mesmo estilo do ensaio atual",
  },
  {
    id: "professional",
    title: "Profissional",
    description: "Autoridade rápida para perfil, WhatsApp e redes sociais.",
    theme:
      "Ensaio profissional premium para perfil, WhatsApp, LinkedIn e posicionamento de autoridade",
  },
  {
    id: "luxury",
    title: "Luxo",
    description: "Mais presença, impacto e visual impossível de ignorar.",
    theme:
      "Ensaio luxuoso, sofisticado, premium, com estética cara e presença marcante",
  },
  {
    id: "birthday",
    title: "Aniversário",
    description: "Uma nova rodada com brilho, balões e clima de comemoração.",
    theme:
      "Ensaio de aniversário com balões elegantes, confetes, brilho, comemoração e visual fotográfico premium",
  },
  {
    id: "social",
    title: "Redes sociais",
    description: "Fotos mais chamativas para story, status e feed.",
    theme:
      "Ensaio moderno e chamativo para redes sociais, status, stories e feed, com visual atual e impactante",
  },
  {
    id: "editorial",
    title: "Editorial",
    description: "Visual de capa, campanha e foto com cara de revista.",
    theme:
      "Ensaio editorial com estética de revista, composição de campanha, styling premium e fotografia de capa",
  },
] as const;

export function Gallery({
  token,
  offer: offerInput,
  galleryPhotos,
  testMode = false,
}: {
  token: string;
  offer?: Partial<GalleryOffer>;
  galleryPhotos?: GalleryPhoto[];
  testMode?: boolean;
}) {
  const router = useRouter();
  const offer = useMemo(() => normalizeOffer(offerInput), [offerInput]);
  const milestones = useMemo(
    () => createMilestones(offer.includedPhotos, offer.gallerySize),
    [offer.gallerySize, offer.includedPhotos],
  );
  const photos = useMemo(
    () =>
      galleryPhotos === undefined
        ? samplePhotos.slice(0, offer.gallerySize)
        : galleryPhotos,
    [galleryPhotos, offer.gallerySize],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [testPaymentApproved, setTestPaymentApproved] = useState(false);
  const [videoAdded, setVideoAdded] = useState(false);
  const [firstImpressionPackAdded, setFirstImpressionPackAdded] =
    useState(false);
  const [firstImpressionPackPhotoIds, setFirstImpressionPackPhotoIds] =
    useState<string[]>([]);
  const [firstImpressionPackPickerOpen, setFirstImpressionPackPickerOpen] =
    useState(false);
  const [videoPhotoIds, setVideoPhotoIds] = useState<string[]>([]);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [pixReady, setPixReady] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState<PhotoDownload[]>([]);
  const [unlockedPhotoIds, setUnlockedPhotoIds] = useState<string[]>([]);
  const [blockedPhotoIds, setBlockedPhotoIds] = useState<string[]>([]);
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({});
  const [unlockedViews, setUnlockedViews] = useState<Record<string, string>>({});
  const [photoCredit, setPhotoCredit] = useState(offer.paidAmount);
  const [videoAccess, setVideoAccess] = useState<{
    status: string;
    url?: string | null;
    clips?: { number: number; url: string }[];
    error?: string | null;
  } | null>(null);
  const [relatedGalleries, setRelatedGalleries] = useState<
    { token: string; title: string; status?: string | null; url: string }[]
  >([]);
  const effectiveUnlockedPhotoIds = useMemo(
    () => unlockedPhotoIds.filter((photoId) => !blockedPhotoIds.includes(photoId)),
    [blockedPhotoIds, unlockedPhotoIds],
  );
  const [checkoutError, setCheckoutError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [creatingPix, setCreatingPix] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [savingAllFiles, setSavingAllFiles] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [manualReleaseOpen, setManualReleaseOpen] = useState(false);
  const [manualPassword, setManualPassword] = useState("");
  const [manualReleasing, setManualReleasing] = useState(false);
  const [manualBlocking, setManualBlocking] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixPayment, setPixPayment] = useState<{
    orderId: string;
    paymentId: string;
    amount: number;
    qrCode?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
  } | null>(null);
  const [upsellCreatingStyle, setUpsellCreatingStyle] = useState<string | null>(
    null,
  );
  const [upsellCheckingPayment, setUpsellCheckingPayment] = useState(false);
  const [upsellPixCopied, setUpsellPixCopied] = useState(false);
  const [upsellError, setUpsellError] = useState("");
  const [upsellPayment, setUpsellPayment] = useState<{
    orderId: string;
    paymentId: string;
    galleryToken: string;
    galleryUrl: string;
    amount: number;
    qrCode?: string;
    qrCodeBase64?: string;
  } | null>(null);
  const videoPhotos = useMemo(() => {
    return videoPhotoIds
      .map((photoId) => photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is (typeof photos)[number] => Boolean(photo));
  }, [photos, videoPhotoIds]);
  const defaultFirstImpressionPackPhotoIds = firstImpressionPackPhotoIds.length
    ? firstImpressionPackPhotoIds
    : selected.slice(0, 1);
  const effectiveFirstImpressionPackPhotoIds = firstImpressionPackAdded
    ? defaultFirstImpressionPackPhotoIds
    : [];
  const firstImpressionPackPhotos = useMemo(() => {
    return defaultFirstImpressionPackPhotoIds
      .map((photoId) => photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is (typeof photos)[number] => Boolean(photo));
  }, [defaultFirstImpressionPackPhotoIds, photos]);

  function getPricing(count: number) {
    const totalCents = getTotalPhotoAmountCents(offer, count);
    const total = totalCents / 100;
    const referenceUnit =
      (offer.pricingBaseAmount / Math.max(1, offer.includedPhotos)) * 1.25;
    const fullPrice =
      offer.paidAmount +
      Math.max(0, count - offer.includedPhotos) * referenceUnit;
    const savings = Math.max(0, fullPrice - total);
    const discount = count ? Math.round((savings / fullPrice) * 100) : 0;
    const unitPrice = count ? total / count : 0;
    const dueNow =
      count > offer.includedPhotos
        ? Math.max(0, (totalCents - toCents(offer.paidAmount)) / 100)
        : 0;
    const nextMilestone = milestones.find(
      (milestone) => milestone.quantity > count,
    );

    return {
      total,
      savings,
      discount,
      unitPrice,
      dueNow,
      nextMilestone,
    };
  }

  const targetPhotoCount = new Set([
    ...effectiveUnlockedPhotoIds,
    ...selected,
  ]).size;
  const basePricing = getPricing(targetPhotoCount);
  const pricing = {
    ...basePricing,
    dueNow: selected.length
      ? Math.max(0, basePricing.total - photoCredit)
      : 0,
  };
  const nextPrice = pricing.nextMilestone
    ? getPricing(pricing.nextMilestone.quantity)
    : null;
  const photosToNextDeal = pricing.nextMilestone
    ? Math.max(0, pricing.nextMilestone.quantity - targetPhotoCount)
    : 0;
  const nextDealAdditional = nextPrice
    ? Math.max(0, nextPrice.total - photoCredit) - pricing.dueNow
    : 0;
  const fullGalleryPricing = getPricing(offer.gallerySize);
  const fullGalleryDueNow = Math.max(0, fullGalleryPricing.total - photoCredit);
  const floatingOfferThreshold = Math.max(
    offer.includedPhotos + 1,
    Math.ceil(offer.gallerySize * 0.6),
  );
  const showFloatingSelectAllCta =
    offer.gallerySize >= 5 &&
    targetPhotoCount >= floatingOfferThreshold &&
    targetPhotoCount < offer.gallerySize;
  const fullGalleryUpgradeAmount = Math.max(
    0,
    fullGalleryDueNow - pricing.dueNow,
  );
  const floatingSelectAllLabel =
    fullGalleryUpgradeAmount < 0.005
      ? `Leve as ${offer.gallerySize} sem pagar nada a mais`
      : `Leve as ${offer.gallerySize} por só ${money.format(
          fullGalleryUpgradeAmount,
        )} a mais`;
  const firstExtraAmount =
    getFirstExtraAmountCentsFromPricingBaseAmountCents({
      pricingBaseAmountCents: getPricingBaseAmountCents(offer),
      includedPhotos: offer.includedPhotos,
    }) / 100;
  const oneClickUpsellPrice = Math.min(14.9, offer.newShootPrice);
  const oneClickUpsellDiscount = Math.max(
    0,
    offer.newShootPrice - oneClickUpsellPrice,
  );
  const hasUnlockedPurchases =
    effectiveUnlockedPhotoIds.length > 0 ||
    photoCredit > offer.paidAmount + 0.005;
  const selectedUnlockedCount = selected.filter((photoId) =>
    effectiveUnlockedPhotoIds.includes(photoId),
  ).length;
  const selectedLockedCount = selected.length - selectedUnlockedCount;
  const selectionOnlyUnlocked =
    selected.length > 0 && selectedLockedCount === 0;
  const selectionIsIncluded =
    selected.length > 0 && pricing.dueNow === 0;
  const firstImpressionPackPrice =
    offer.galleryType === "professional" && firstImpressionPackAdded
    ? effectiveFirstImpressionPackPhotoIds.length *
      offer.firstImpressionPackPrice
    : 0;
  const videoPrice = videoAdded
    ? getVideoPrice(videoPhotoIds.length || 1, offer.videoPrice)
    : 0;
  const checkoutAmount =
    pricing.dueNow + firstImpressionPackPrice + videoPrice;
  const unlockedVideoCount =
    (videoAccess?.url ? 1 : 0) + (videoAccess?.clips?.length ?? 0);
  const unlockedFileCount = downloadLinks.length + unlockedVideoCount;

  const refreshAccess = useCallback(async () => {
    if (token === "demo") return;
    const response = await fetch(
      `/api/gallery/access?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      ok: boolean;
      photoCredit?: number;
      blockedPhotoIds?: string[];
      photos?: {
        photoId: string;
        number: number;
        viewUrl?: string;
        downloadUrl?: string;
      }[];
      video?: {
        status: string;
        url?: string | null;
        clips?: { number: number; url: string }[];
        error?: string | null;
      } | null;
      relatedGalleries?: {
        token: string;
        title: string;
        status?: string | null;
        url: string;
      }[];
    };

    if (!response.ok || !result.ok) return;
    const unlocked = result.photos ?? [];
    setUnlockedPhotoIds(unlocked.map((photo) => photo.photoId));
    setBlockedPhotoIds(result.blockedPhotoIds ?? []);
    setUnlockedViews(
      Object.fromEntries(
        unlocked
          .filter((photo) => photo.viewUrl)
          .map((photo) => [photo.photoId, photo.viewUrl as string]),
      ),
    );
    setDownloadLinks(
      unlocked
        .filter((photo) => photo.downloadUrl)
        .map((photo) => ({
          photoId: photo.photoId,
          number: photo.number,
          url: photo.downloadUrl as string,
        }))
        .sort((first, second) => first.number - second.number),
    );
    if (typeof result.photoCredit === "number") {
      setPhotoCredit(result.photoCredit);
    }
    setVideoAccess(result.video ?? null);
    setRelatedGalleries(result.relatedGalleries ?? []);
  }, [token]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    const coarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;
    const mobileUserAgent =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    setIsMobileDevice(coarsePointer || mobileUserAgent);
  }, []);

  useEffect(() => {
    if (
      token === "demo" ||
      galleryPhotos === undefined ||
      photos.length >= offer.gallerySize
    ) {
      return;
    }
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [galleryPhotos, offer.gallerySize, photos.length, router, token]);

  useEffect(() => {
    if (token === "demo") return;
    const interval = window.setInterval(
      () => void refreshAccess(),
      10 * 60 * 1000,
    );
    return () => window.clearInterval(interval);
  }, [refreshAccess, token]);

  useEffect(() => {
    if (videoAccess?.status !== "generating") return;
    const interval = window.setInterval(() => void refreshAccess(), 15000);
    return () => window.clearInterval(interval);
  }, [refreshAccess, videoAccess?.status]);

  function togglePhoto(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((photoId) => photoId !== id)
        : [...current, id],
    );
  }

  function selectAll() {
    setSelected(
      photos
        .filter((photo) => !effectiveUnlockedPhotoIds.includes(photo.id))
        .map((photo) => photo.id),
    );
  }

  function handlePrimaryAction() {
    if (!selected.length) return;
    setTestPaymentApproved(false);
    setPixReady(false);
    setVideoAdded(false);
    setFirstImpressionPackAdded(false);
    setFirstImpressionPackPhotoIds(selected.slice(0, 1));
    setFirstImpressionPackPickerOpen(false);
    setVideoPhotoIds(selected.slice(0, 1));
    setVideoPickerOpen(false);
    setCheckoutError("");
    setPixPayment(null);
    setPixCopied(false);
    setManualReleaseOpen(false);
    setCheckoutOpen(true);
  }

  async function copyPixCode() {
    if (!pixPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
      setCheckoutError("");
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 3500);
    } catch {
      setCheckoutError(
        "Não foi possível copiar automaticamente. Toque e segure o código Pix para copiar.",
      );
    }
  }

  async function copyUpsellPixCode() {
    if (!upsellPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(upsellPayment.qrCode);
      setUpsellError("");
      setUpsellPixCopied(true);
      window.setTimeout(() => setUpsellPixCopied(false), 3500);
    } catch {
      setUpsellError(
        "Não foi possível copiar automaticamente. Toque e segure o código Pix para copiar.",
      );
    }
  }

  async function createOneClickUpsell(style: (typeof oneClickUpsellStyles)[number]) {
    if (token === "demo") {
      setUpsellError("O upsell de 1 clique não roda na galeria demonstrativa.");
      return;
    }

    setUpsellCreatingStyle(style.id);
    setUpsellError("");
    setUpsellPixCopied(false);

    const formData = new FormData();
    formData.set("sourceToken", token);
    formData.set("theme", style.theme);
    formData.set("offer", "upsell");
    formData.set("paidAmount", oneClickUpsellPrice.toFixed(2));
    formData.set("includedPhotos", String(offer.includedPhotos));
    formData.set("generationCount", String(offer.gallerySize));
    formData.set("firstExtraAmount", firstExtraAmount.toFixed(2));

    const response = await fetch("/api/repeat-shoots", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      orderId?: string;
      paymentId?: string;
      galleryToken?: string;
      galleryUrl?: string;
      amount?: number;
      qrCode?: string;
      qrCodeBase64?: string;
    };
    setUpsellCreatingStyle(null);

    if (
      !response.ok ||
      !result.ok ||
      !result.orderId ||
      !result.paymentId ||
      !result.galleryToken ||
      !result.galleryUrl
    ) {
      setUpsellError(result.error ?? "Não foi possível gerar o Pix do novo ensaio.");
      return;
    }

    setUpsellPayment({
      orderId: result.orderId,
      paymentId: result.paymentId,
      galleryToken: result.galleryToken,
      galleryUrl: result.galleryUrl,
      amount: result.amount ?? oneClickUpsellPrice,
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
    });
  }

  async function checkUpsellPayment() {
    if (!upsellPayment) return;

    setUpsellCheckingPayment(true);
    setUpsellError("");
    const response = await fetch("/api/checkout/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        galleryToken: upsellPayment.galleryToken,
        orderId: upsellPayment.orderId,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      paid?: boolean;
      error?: string;
    };
    setUpsellCheckingPayment(false);

    if (!response.ok || !result.ok) {
      setUpsellError(result.error ?? "Não foi possível conferir o pagamento.");
      return;
    }

    if (!result.paid) {
      setUpsellError("Ainda não encontrei o pagamento. Tente novamente em alguns segundos.");
      return;
    }

    trackBrowserPurchase({
      paymentId: upsellPayment.paymentId,
      orderId: upsellPayment.orderId,
      value: upsellPayment.amount,
    });
    window.location.href = upsellPayment.galleryUrl;
  }

  async function savePhotoToDevice(download: PhotoDownload) {
    const fileName = `home-studio-foto-${String(download.number).padStart(
      2,
      "0",
    )}.jpg`;

    if (!isMobileDevice) {
      const link = document.createElement("a");
      link.href = download.url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    setSavingPhotoId(download.photoId);
    setCheckoutError("");

    try {
      const response = await fetch(download.url);
      if (!response.ok) throw new Error("Falha ao buscar imagem.");

      const blob = await response.blob();
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
      });
      const shareData = {
        files: [file],
        title: `Foto ${String(download.number).padStart(2, "0")}`,
      };

      if (
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        "canShare" in navigator &&
        navigator.canShare(shareData)
      ) {
        await navigator.share(shareData);
        return;
      }

      const link = document.createElement("a");
      link.href = download.url;
      link.download = file.name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      window.open(download.url, "_blank", "noopener,noreferrer");
      setCheckoutError(
        "Se a foto abrir em outra tela, toque e segure na imagem para salvar no celular.",
      );
    } finally {
      setSavingPhotoId(null);
    }
  }

  async function downloadAllUnlockedFiles() {
    if (isMobileDevice || savingAllFiles) return;

    const files: DownloadFile[] = [
      ...downloadLinks.map((download) => ({
        url: download.url,
        fileName: `home-studio-foto-${String(download.number).padStart(
          2,
          "0",
        )}.jpg`,
      })),
      ...(videoAccess?.url
        ? [
            {
              url: videoAccess.url,
              fileName: "home-studio-video.mp4",
            },
          ]
        : []),
      ...(videoAccess?.clips ?? []).map((clip) => ({
        url: clip.url,
        fileName: `home-studio-video-${String(clip.number).padStart(
          2,
          "0",
        )}.mp4`,
      })),
    ];

    setSavingAllFiles(true);
    setCheckoutError("");

    try {
      const zipFiles = await Promise.all(
        files.map(async (file) => {
          const response = await fetch(file.url);
          if (!response.ok) {
            throw new Error(`Falha ao baixar ${file.fileName}.`);
          }

          return {
            name: file.fileName,
            data: new Uint8Array(await response.arrayBuffer()),
          };
        }),
      );
      const zip = createZip(zipFiles);
      const url = URL.createObjectURL(zip);
      const link = document.createElement("a");
      link.href = url;
      link.download = "home-studio-arquivos.zip";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setCheckoutError(
        "Não foi possível montar o ZIP. Tente baixar os arquivos um por um.",
      );
    } finally {
      setSavingAllFiles(false);
    }
  }

  function approveTestPayment() {
    setTestPaymentApproved(true);
  }

  function toggleVideoPhoto(id: string) {
    setVideoPhotoIds((current) => {
      if (current.includes(id)) {
        return current.length === 1
          ? current
          : current.filter((photoId) => photoId !== id);
      }

      return [...current, id];
    });
  }

  function toggleFirstImpressionPackPhoto(id: string) {
    setFirstImpressionPackPhotoIds((current) => {
      if (current.includes(id)) {
        return current.length === 1
          ? current
          : current.filter((photoId) => photoId !== id);
      }

      return [...current, id];
    });
  }

  async function releaseSelectedPhotos(manual = false) {
    if (token === "demo") {
      approveTestPayment();
      return;
    }

    if (!selected.length) {
      setCheckoutError("Selecione pelo menos uma foto na galeria.");
      return;
    }

    if (manual && !manualPassword.trim()) {
      setCheckoutError("Digite a senha de liberação manual.");
      return;
    }

    if (manual) {
      setManualReleasing(true);
    } else {
      setReleasing(true);
    }
    setCheckoutError("");
    const response = await fetch("/api/downloads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        galleryToken: token,
        photoIds: selected,
        ...(manual ? { manualPassword: manualPassword.trim() } : {}),
      }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      downloads?: {
        photoId: string;
        number: number;
        url: string;
        viewUrl?: string;
      }[];
    };
    setReleasing(false);
    setManualReleasing(false);

    if (!response.ok || !result.ok || !result.downloads) {
      setCheckoutError(result.error ?? "Não foi possível liberar as fotos.");
      return;
    }

    const downloads = result.downloads;

    setDownloadLinks(
      [...downloads].sort(
        (first, second) => first.number - second.number,
      ),
    );
    setUnlockedPhotoIds((current) => [
      ...new Set([...current, ...downloads.map((item) => item.photoId)]),
    ]);
    const released = new Set(downloads.map((download) => download.photoId));
    setBlockedPhotoIds((current) =>
      current.filter((photoId) => !released.has(photoId)),
    );
    setUnlockedViews((current) => ({
      ...current,
      ...Object.fromEntries(
        downloads
          .filter((item) => item.viewUrl)
          .map((item) => [item.photoId, item.viewUrl as string]),
      ),
    }));
    setTestPaymentApproved(true);
    if (manual) setManualPassword("");
    void refreshAccess();
  }

  async function blockSelectedPhotos() {
    if (token === "demo") return;

    if (!selected.length) {
      setCheckoutError("Selecione pelo menos uma foto para bloquear.");
      return;
    }

    if (!manualPassword.trim()) {
      setCheckoutError("Digite a senha para bloquear fotos.");
      return;
    }

    setManualBlocking(true);
    setCheckoutError("");

    try {
      const response = await fetch("/api/downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          galleryToken: token,
          photoIds: selected,
          manualPassword: manualPassword.trim(),
          action: "block",
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        blockedPhotoIds?: string[];
        blockedPreviews?: { photoId: string; previewUrl?: string }[];
      };

      if (!response.ok || !result.ok) {
        setCheckoutError(result.error ?? "Não foi possível bloquear as fotos.");
        return;
      }

      const blocked = new Set(result.blockedPhotoIds ?? selected);
      const previews = Object.fromEntries(
        (result.blockedPreviews ?? [])
          .filter((preview) => preview.previewUrl)
          .map((preview) => [preview.photoId, preview.previewUrl as string]),
      );
      const fallbackPreviews = Object.fromEntries(
        selected
          .map((photoId) => photos.find((photo) => photo.id === photoId))
          .filter((photo): photo is (typeof photos)[number] => Boolean(photo))
          .map((photo) => [
            photo.id,
            `${photo.previewUrl}${
              photo.previewUrl.includes("?") ? "&" : "?"
            }blocked=${Date.now()}`,
          ]),
      );
      setPreviewOverrides((current) => ({
        ...current,
        ...fallbackPreviews,
        ...previews,
      }));
      setBlockedPhotoIds((current) => [...new Set([...current, ...blocked])]);
      setUnlockedPhotoIds((current) =>
        current.filter((photoId) => !blocked.has(photoId)),
      );
      setDownloadLinks((current) =>
        current.filter((download) => !blocked.has(download.photoId)),
      );
      setUnlockedViews((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([photoId]) => !blocked.has(photoId)),
        ),
      );
      setSelected([]);
      setManualPassword("");
      setTestPaymentApproved(false);
      await refreshAccess();
      router.refresh();
    } catch {
      setCheckoutError("Não foi possível bloquear as fotos. Tente novamente.");
    } finally {
      setManualBlocking(false);
    }
  }

  function handleUnlockedPhotoDragStart({
    event,
    isUnlocked,
    url,
  }: {
    event: DragEvent<HTMLImageElement>;
    isUnlocked: boolean;
    url: string;
  }) {
    if (!isUnlocked) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", url);
    event.dataTransfer.setData("text/uri-list", url);
    event.dataTransfer.setData("text/html", `<img src="${url}" alt="" />`);
  }

  async function continueCheckout() {
    if (checkoutAmount > 0) {
      if (testMode || token === "demo") {
        setPixReady(true);
        return;
      }

      setCreatingPix(true);
      setCheckoutError("");
      const response = await fetch("/api/checkout/pix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          galleryToken: token,
          photoIds: selected,
          firstImpressionPackAdded,
          firstImpressionPackPhotoIds: effectiveFirstImpressionPackPhotoIds,
          videoAdded,
          videoPhotoIds,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        orderId?: string;
        paymentId?: string;
        amount?: number;
        qrCode?: string;
        qrCodeBase64?: string;
        ticketUrl?: string;
      };
      setCreatingPix(false);

      if (!response.ok || !result.ok || !result.orderId || !result.paymentId) {
        setCheckoutError(result.error ?? "Não foi possível gerar o Pix.");
        return;
      }

      setPixPayment({
        orderId: result.orderId,
        paymentId: result.paymentId,
        amount: result.amount ?? checkoutAmount,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        ticketUrl: result.ticketUrl,
      });
      setPixReady(true);
      return;
    }

    await releaseSelectedPhotos();
  }

  async function checkPaymentAndRelease() {
    if (!pixPayment) {
      approveTestPayment();
      return;
    }

    setCheckingPayment(true);
    setCheckoutError("");
    const response = await fetch("/api/checkout/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        galleryToken: token,
        orderId: pixPayment.orderId,
      }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      paid?: boolean;
      error?: string;
    };
    setCheckingPayment(false);

    if (!response.ok || !result.ok) {
      setCheckoutError(result.error ?? "Não foi possível conferir o pagamento.");
      return;
    }

    if (!result.paid) {
      setCheckoutError(
        "Ainda não encontrei o pagamento. Tente novamente em alguns segundos.",
      );
      return;
    }

    trackBrowserPurchase({
      paymentId: pixPayment.paymentId,
      orderId: pixPayment.orderId,
      value: pixPayment.amount,
    });
    await releaseSelectedPhotos();
  }

  useEffect(() => {
    if (!pixReady || !pixPayment || token === "demo" || testPaymentApproved) {
      return;
    }

    let stopped = false;
    let paymentHandled = false;

    async function pollPayment() {
      if (stopped || paymentHandled || !pixPayment) return;

      const response = await fetch("/api/checkout/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          galleryToken: token,
          orderId: pixPayment.orderId,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        paid?: boolean;
      };

      if (!stopped && response.ok && result.ok && result.paid) {
        paymentHandled = true;
        trackBrowserPurchase({
          paymentId: pixPayment.paymentId,
          orderId: pixPayment.orderId,
          value: pixPayment.amount,
        });
        await releaseSelectedPhotos();
      }
    }

    void pollPayment();
    const interval = window.setInterval(() => void pollPayment(), 5000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
    // The checkout snapshot must remain stable while this Pix is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixPayment, pixReady, testPaymentApproved, token]);

  useEffect(() => {
    if (!upsellPayment || token === "demo") return;

    let stopped = false;
    let paymentHandled = false;

    async function pollUpsellPayment() {
      if (stopped || paymentHandled || !upsellPayment) return;

      const response = await fetch("/api/checkout/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          galleryToken: upsellPayment.galleryToken,
          orderId: upsellPayment.orderId,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        paid?: boolean;
      };

      if (!stopped && response.ok && result.ok && result.paid) {
        paymentHandled = true;
        trackBrowserPurchase({
          paymentId: upsellPayment.paymentId,
          orderId: upsellPayment.orderId,
          value: upsellPayment.amount,
        });
        window.location.href = upsellPayment.galleryUrl;
      }
    }

    void pollUpsellPayment();
    const interval = window.setInterval(() => void pollUpsellPayment(), 5000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [token, upsellPayment]);

  const isProfessionalGallery = offer.galleryType === "professional";
  const includedLabel =
    offer.includedPhotos === 1
      ? "1 foto incluída"
      : `${offer.includedPhotos} fotos incluídas`;
  const readyTitle = isProfessionalGallery
    ? "Escolha suas fotos profissionais."
    : "Agora escolha as fotos que você mais amou.";
  const includedIntroText = isProfessionalGallery
    ? `Você tem até ${includedLabel}. Se gostar de mais alguma, pode liberar fotos extras com desconto.`
    : null;
  const galleryStatusText = isProfessionalGallery
    ? `Escolha até ${offer.includedPhotos} fotos incluídas. As demais ficam disponíveis com desconto progressivo.`
    : null;

  return (
    <main className="gallery-shell">
      <nav className="gallery-nav" aria-label="Galeria">
        <a className="brand" href="#top" aria-label="Home Studio">
          HOME <span>STUDIO</span>
        </a>
        <div className="nav-meta">
          <span className="status-dot" />
          {testMode
            ? "Modo de teste"
            : photos.length < offer.gallerySize
              ? "Preparando fotos"
              : "Galeria pronta"}
        </div>
      </nav>

      {showFloatingSelectAllCta && (
        <aside
          aria-label="Oferta para liberar todas as fotos"
          className="floating-full-gallery-offer"
        >
          <button onClick={selectAll} type="button">
            <strong>{floatingSelectAllLabel}</strong>
            <small>
              {fullGalleryUpgradeAmount < 0.005
                ? "Você já chegou ao melhor valor. Complete sua galeria."
                : "Complete seu ensaio com o melhor custo por foto."}
            </small>
          </button>
        </aside>
      )}

      <header className="gallery-header" id="top">
        <div className="gallery-intro">
          <span className="eyebrow">
            {photos.length < offer.gallerySize
              ? "SEU ENSAIO ESTÁ SENDO PREPARADO"
              : "SEU ENSAIO ESTÁ PRONTO"}
          </span>
          <h1>
            {photos.length < offer.gallerySize
              ? "As primeiras fotos já estão aparecendo."
              : readyTitle}
          </h1>
          <p>
            {includedIntroText ??
              (offer.includedPhotos > 0
                ? `Você já tem ${offer.includedPhotos} ${
                    offer.includedPhotos === 1
                      ? "foto incluída"
                      : "fotos incluídas"
                  }.`
                : "Escolha as fotos que quiser levar.")}{" "}
            {!isProfessionalGallery &&
              "O melhor desconto será aplicado automaticamente."}
          </p>
        </div>
        <div className="gallery-status">
          <span>{token === "demo" ? "Galeria demonstrativa" : "Sua galeria"}</span>
          <strong>
            {galleryPhotos === undefined
              ? offer.gallerySize
              : galleryPhotos.length}{" "}
            fotos disponíveis
          </strong>
          <small>
            {galleryStatusText ??
              (offer.paidAmount > 0
                ? `Crédito de ${money.format(offer.paidAmount)} reconhecido.`
                : "Nenhum pagamento registrado ainda.")}{" "}
            {!isProfessionalGallery &&
              "Galeria disponível por 7 dias; depois disso, os arquivos são excluídos."}
          </small>
        </div>
      </header>

      {(downloadLinks.length > 0 || videoAccess || relatedGalleries.length > 0) && (
        <section className="owned-files" aria-label="Arquivos liberados">
          <div>
            <span className="section-kicker">SUAS COMPRAS</span>
            <h2>Seus arquivos ficam aqui por 7 dias.</h2>
            <p>
              Baixe novamente suas fotos e vídeos liberados, ou acesse outros
              ensaios que você comprou.
            </p>
            <div className="auto-release-note">
              <strong>Pagamento confirmado automaticamente.</strong>
              <span>
                Não precisa enviar comprovante no WhatsApp. ☺️ As fotos
                compradas já foram liberadas aqui na galeria.
              </span>
            </div>
          </div>
          <div className="owned-actions">
            {!isMobileDevice && unlockedFileCount > 1 && (
              <button
                className="primary-button"
                disabled={savingAllFiles}
                onClick={() => void downloadAllUnlockedFiles()}
                type="button"
              >
                {savingAllFiles ? "Preparando ZIP..." : "Baixar tudo em ZIP"}
              </button>
            )}
            {downloadLinks.map((download) => (
              <button
                className="secondary-button"
                key={download.photoId}
                onClick={() => void savePhotoToDevice(download)}
                type="button"
              >
                {savingPhotoId === download.photoId
                  ? "Abrindo..."
                  : isMobileDevice
                    ? `Salvar foto ${String(download.number).padStart(2, "0")}`
                    : `Baixar foto ${String(download.number).padStart(2, "0")}`}
              </button>
            ))}
            {videoAccess?.status === "generating" && (
              <span className="file-status">Vídeo em produção...</span>
            )}
            {videoAccess?.status === "failed" && (
              <span className="file-status error">
                Não foi possível concluir o vídeo. Fale com o suporte.
              </span>
            )}
            {videoAccess?.url && (
              <a className="primary-button" download href={videoAccess.url}>
                Baixar meu vídeo
              </a>
            )}
            {!videoAccess?.url &&
              videoAccess?.clips?.map((clip) => (
                <a
                  className="primary-button"
                  download
                  href={clip.url}
                  key={clip.url}
                >
                  Baixar vídeo {String(clip.number).padStart(2, "0")}
                </a>
              ))}
            {relatedGalleries.map((gallery) => (
              <a
                className="secondary-button"
                href={gallery.url}
                key={gallery.token}
              >
                Abrir {gallery.title}
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="deal-section" aria-labelledby="deal-title">
        <div className="deal-heading">
          <div>
            <span className="section-kicker">DESCONTO PROGRESSIVO</span>
            <h2 id="deal-title">
              {hasUnlockedPurchases
                ? "Quer liberar mais fotos?"
                : offer.includedPhotos === 0
                  ? "Escolha suas favoritas."
                  : offer.includedPhotos === 1
                  ? "Sua foto já está garantida."
                  : `Suas ${offer.includedPhotos} fotos já estão garantidas.`}
            </h2>
            {hasUnlockedPurchases && (
              <p className="deal-note">
                Os valores abaixo mostram apenas o que falta para chegar em cada
                faixa. O que você já liberou continua garantido.
              </p>
            )}
          </div>
          <button
            className="select-all-cta"
            onClick={selectAll}
            type="button"
          >
            <span>Quero todas</span>
          </button>
        </div>

        <div className="milestone-track">
          {milestones.map((milestone) => {
            const milestonePricing = getPricing(milestone.quantity);
            const reached = targetPhotoCount >= milestone.quantity;
            const isNext =
              pricing.nextMilestone?.quantity === milestone.quantity;
            const isIncluded =
              milestone.quantity === offer.includedPhotos;
            const remainingForMilestone = Math.max(
              0,
              milestonePricing.total - photoCredit,
            );
            const milestoneAmountLabel = hasUnlockedPurchases
              ? remainingForMilestone > 0
                ? `+ ${money.format(remainingForMilestone)}`
                : "Liberado"
              : money.format(milestonePricing.total);
            const milestoneHelpLabel = hasUnlockedPurchases
              ? remainingForMilestone > 0
                ? `para ${milestone.quantity} fotos`
                : "já liberado"
              : isIncluded
                ? "já pago"
                : `${money.format(milestonePricing.unitPrice)}/foto`;

            return (
              <div
                className={`milestone ${reached ? "reached" : ""} ${isNext ? "next" : ""}`}
                key={milestone.quantity}
              >
                {milestone.quantity === offer.gallerySize && (
                  <span className="best-value">Melhor valor</span>
                )}
                <span className="milestone-count">{milestone.quantity}</span>
                <span className="milestone-label">{milestone.label}</span>
                <strong>{milestoneAmountLabel}</strong>
                <small>{milestoneHelpLabel}</small>
              </div>
            );
          })}
        </div>

        {selected.length > 0 && pricing.nextMilestone && nextPrice && (
          <div className="smart-nudge" role="status">
            <span className="nudge-icon" aria-hidden="true">
              ↓
            </span>
            <p>
              Selecione mais <strong>{photosToNextDeal}</strong>{" "}
              {photosToNextDeal === 1 ? "foto" : "fotos"} e chegue ao pacote{" "}
              <strong>{pricing.nextMilestone.label}</strong>. Você leva{" "}
              {pricing.nextMilestone.quantity} por apenas{" "}
              <strong>
                {money.format(Math.max(0, nextDealAdditional))} a mais
              </strong>
              .
            </p>
          </div>
        )}
      </section>

      <div className="selection-heading">
        <div>
          <span className="section-kicker">SUAS FOTOS</span>
          <h2>
            {isProfessionalGallery
              ? "Toque nas fotos que deseja liberar"
              : "Toque para selecionar"}
          </h2>
          {isProfessionalGallery && selected.length > 0 && (
            <p>
              {Math.min(targetPhotoCount, offer.includedPhotos)} de{" "}
              {offer.includedPhotos} fotos incluídas selecionadas
              {targetPhotoCount > offer.includedPhotos
                ? ` · ${targetPhotoCount - offer.includedPhotos} fotos extras selecionadas`
                : ""}
            </p>
          )}
        </div>
        {selected.length > 0 && (
          <button
            className="text-button muted"
            onClick={() => setSelected([])}
            type="button"
          >
            Limpar seleção
          </button>
        )}
      </div>

      <section className="photo-grid" aria-label="Fotos disponíveis">
        {galleryPhotos !== undefined && photos.length === 0 && (
          <div className="gallery-processing">
            <span className="status-dot" />
            <strong>Estamos preparando seu ensaio.</strong>
            <p>
              As fotos aparecerão aqui conforme forem finalizadas. Você pode
              voltar usando este mesmo link.
            </p>
          </div>
        )}
        {photos.map((photo) => {
          const selectionPosition = selected.indexOf(photo.id);
          const isSelected = selectionPosition >= 0;
          const isBlocked = blockedPhotoIds.includes(photo.id);
          const isUnlocked = effectiveUnlockedPhotoIds.includes(photo.id);
          const displayUrl = isBlocked
            ? previewOverrides[photo.id] ?? photo.previewUrl
            : unlockedViews[photo.id] ??
              previewOverrides[photo.id] ??
              photo.previewUrl;
          const shouldShowWatermark = !isUnlocked && Boolean(displayUrl);
          const tone =
            "tone" in photo && typeof photo.tone === "number" ? photo.tone : 0;

          return (
            <div
              aria-label={
                isUnlocked
                  ? `Foto ${photo.number} liberada`
                  : `${isSelected ? "Remover" : "Selecionar"} foto ${photo.number}`
              }
              aria-pressed={isSelected}
              className={`photo-card ${isSelected ? "selected" : ""} ${
                isUnlocked ? "unlocked" : ""
              }`}
              key={photo.id}
              onClick={() => togglePhoto(photo.id)}
              onContextMenu={(event) => {
                if (!isUnlocked) event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                togglePhoto(photo.id);
              }}
              role="button"
              tabIndex={0}
            >
              <span
                className="photo-placeholder"
                style={
                  displayUrl
                    ? undefined
                    : {
                        background: `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                      }
                }
              >
                {displayUrl && (
                  <img
                    alt=""
                    className="photo-image"
                    decoding="async"
                    draggable={isUnlocked}
                    fetchPriority={photo.number <= 4 ? "high" : "auto"}
                    loading={photo.number <= 4 ? "eager" : "lazy"}
                    onDragStart={(event) =>
                      handleUnlockedPhotoDragStart({
                        event,
                        isUnlocked,
                        url: displayUrl,
                      })
                    }
                    src={displayUrl}
                  />
                )}
              </span>
              <span className="photo-shade" />
              {shouldShowWatermark && (
                <span aria-hidden="true" className="photo-watermark">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span className="photo-watermark-line" key={index}>
                      HOMESTUDIO.IA HOMESTUDIO.IA HOMESTUDIO.IA
                    </span>
                  ))}
                </span>
              )}
              {isUnlocked && (
                <span className="unlocked-badge">Liberada</span>
              )}
              <span className="photo-number">
                Foto {String(photo.number).padStart(2, "0")}
              </span>
              <span className="checkmark">
                {isSelected ? (
                  <span className="selection-order">
                    {selectionPosition + 1}
                  </span>
                ) : (
                  <AddIcon />
                )}
              </span>
            </div>
          );
        })}
      </section>

      <aside className={`checkout-bar ${selected.length ? "active" : ""}`}>
        <div className="checkout-summary">
          <div className="checkout-count">
            <span>
              {selectionOnlyUnlocked
                ? `${selectedUnlockedCount} ${
                    selectedUnlockedCount === 1
                      ? "foto liberada selecionada"
                      : "fotos liberadas selecionadas"
                  }`
                : selectedUnlockedCount > 0
                  ? `${selectedLockedCount} ${
                      selectedLockedCount === 1 ? "nova" : "novas"
                    } + ${selectedUnlockedCount} ${
                      selectedUnlockedCount === 1 ? "liberada" : "liberadas"
                    }`
                  : selected.length
                    ? `${selected.length} ${
                        selected.length === 1
                          ? "foto selecionada"
                          : "fotos selecionadas"
                      }`
                    : "Nenhuma foto selecionada"}
            </span>
            {targetPhotoCount > offer.includedPhotos &&
              pricing.discount > 0 && (
                <strong className="discount-pill">
                  -{pricing.discount}%
                </strong>
              )}
          </div>
          <div className="checkout-pricing">
            <strong>
              {selectionIsIncluded
                ? selectionOnlyUnlocked
                  ? "Liberada"
                  : "Incluída"
                : money.format(pricing.dueNow)}
            </strong>
            {selected.length > 0 && (
              <span>
                {selectionOnlyUnlocked ? (
                  <>Pronta para transformar em vídeo ou baixar</>
                ) : selectionIsIncluded ? (
                  <>
                    {offer.includedPhotos === 1
                      ? "1 foto já paga"
                      : `${offer.includedPhotos} fotos já pagas`}
                  </>
                ) : (
                  <>
                    Total {money.format(pricing.total)} ·{" "}
                    {money.format(photoCredit)} já pagos
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          className={`primary-button checkout-button ${
            pricing.dueNow > 0 ? "checkout-payment-button" : ""
          }`}
          disabled={!selected.length}
          onClick={handlePrimaryAction}
          type="button"
        >
          <span>
            {testPaymentApproved
              ? "Baixar fotos liberadas"
              : selectionOnlyUnlocked
              ? "Transformar em vídeo"
              : selectionIsIncluded
              ? selected.length === 1
                ? "Baixar foto incluída"
                : "Baixar fotos incluídas"
              : pricing.dueNow > 0
                ? "Pagar adicionais no Pix"
                : "Escolha suas fotos"}
          </span>
          {selected.length > 0 && <span aria-hidden="true">→</span>}
        </button>
      </aside>

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="checkout-title"
            aria-modal="true"
            className="checkout-modal"
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className="modal-close"
              onClick={() => setCheckoutOpen(false)}
              type="button"
            >
              ×
            </button>

            {testPaymentApproved ? (
              <>
                <span className="modal-badge success">Pagamento aprovado</span>
                <h2 id="checkout-title">Suas fotos estão liberadas.</h2>
                <p>
                  Baixe agora os arquivos escolhidos. Sua galeria continua neste
                  link por 7 dias caso queira voltar e liberar mais fotos.
                </p>
                <div className="auto-release-note modal-note">
                  <strong>Não precisa enviar comprovante no WhatsApp. ☺️</strong>
                  <span>
                    O pagamento já foi reconhecido e suas fotos selecionadas
                    foram liberadas automaticamente aqui.
                  </span>
                </div>
                {downloadLinks.length > 0 && (
                  <div className="download-list">
                    {downloadLinks.map((download) => (
                      <button
                        className="primary-button"
                        key={download.photoId}
                        onClick={() => void savePhotoToDevice(download)}
                        type="button"
                      >
                        {savingPhotoId === download.photoId
                          ? "Abrindo..."
                          : isMobileDevice
                            ? `Salvar foto ${String(download.number).padStart(2, "0")} no celular`
                            : `Baixar foto ${String(download.number).padStart(2, "0")}`}
                      </button>
                    ))}
                    <small>
                      {isMobileDevice
                        ? "O botão abre as opções nativas para salvar a imagem no celular."
                        : "No computador, o botão baixa a imagem direto."}{" "}
                      Esta galeria continua disponível por 7 dias.
                    </small>
                  </div>
                )}
                <button
                  className="text-button muted"
                  onClick={() => setCheckoutOpen(false)}
                  type="button"
                >
                  Continuar vendo minha galeria
                </button>
                <div className="post-purchase-offer">
                  <span>OFERTA RELÂMPAGO DE 1 CLIQUE</span>
                  <strong>
                    Novo ensaio em 1 clique por {money.format(oneClickUpsellPrice)}
                  </strong>
                  <small>
                    Sua foto já está carregada. Escolha um estilo abaixo, pague
                    no Pix e uma nova galeria com {offer.gallerySize} fotos
                    começa automaticamente, sem enviar nada de novo.
                  </small>
                  <small className="one-click-upsell-urgency">
                    Preço especial desta tela. Se sair agora, o novo ensaio volta
                    ao valor normal.
                  </small>
                  {!upsellPayment ? (
                    <>
                      <div className="one-click-upsell-grid">
                        {oneClickUpsellStyles.map((style) => (
                          <button
                            className="one-click-upsell-card"
                            disabled={Boolean(upsellCreatingStyle)}
                            key={style.id}
                            onClick={() => void createOneClickUpsell(style)}
                            type="button"
                          >
                            <span>{style.title}</span>
                            {oneClickUpsellDiscount > 0.005 && (
                              <small className="one-click-upsell-anchor">
                                De {money.format(offer.newShootPrice)} por
                              </small>
                            )}
                            <strong>{money.format(oneClickUpsellPrice)}</strong>
                            <small>{style.description}</small>
                            <em>
                              {upsellCreatingStyle === style.id
                                ? "Gerando Pix..."
                                : "Gerar em 1 clique"}
                            </em>
                          </button>
                        ))}
                      </div>
                      <small className="upsell-footnote">
                        Desconto aplicado porque vamos reaproveitar a foto que
                        você já enviou. Decisão rápida, galeria nova, mais chance
                        de achar outras fotos perfeitas.
                      </small>
                    </>
                  ) : (
                    <div className="one-click-upsell-pix">
                      <span className="modal-badge warning">Pix do novo ensaio</span>
                      <strong>{money.format(upsellPayment.amount)}</strong>
                      <small>
                        Pague no app do banco. Assim que aprovar, sua nova galeria
                        começa a ser criada e abre sozinha aqui.
                      </small>
                      {upsellPayment.qrCodeBase64 && (
                        <img
                          alt="QR Code Pix"
                          className="pix-qr-image"
                          src={`data:image/png;base64,${upsellPayment.qrCodeBase64}`}
                        />
                      )}
                      {upsellPayment.qrCode && (
                        <button
                          className={`copy-pix-button ${upsellPixCopied ? "copied" : ""}`}
                          onClick={copyUpsellPixCode}
                          type="button"
                        >
                          {upsellPixCopied
                            ? "Pix copiado! Abra seu banco"
                            : "Copiar Pix Copia e Cola"}
                        </button>
                      )}
                      <button
                        className="primary-button modal-primary"
                        disabled={upsellCheckingPayment}
                        onClick={() => void checkUpsellPayment()}
                        type="button"
                      >
                        {upsellCheckingPayment
                          ? "Conferindo..."
                          : "Já paguei, criar minha nova galeria"}
                      </button>
                      <button
                        className="text-button muted"
                        onClick={() => setUpsellPayment(null)}
                        type="button"
                      >
                        Voltar aos estilos
                      </button>
                    </div>
                  )}
                  {upsellError && <p className="form-error">{upsellError}</p>}
                  <button
                    className="text-button muted"
                    onClick={() => setCheckoutOpen(false)}
                    type="button"
                  >
                    Continuar com este ensaio
                  </button>
                </div>
              </>
            ) : pixReady ? (
              <>
                <span className="modal-badge warning">
                  {pixPayment ? "Pix gerado" : "Simulação de Pix"}
                </span>
                <h2 id="checkout-title">
                  {money.format(pixPayment?.amount ?? checkoutAmount)}
                </h2>
                <p>
                  Pague com o QR Code ou use o Pix Copia e Cola. Assim que o
                  pagamento for aprovado, suas fotos serão liberadas aqui.
                </p>
                <div className="auto-release-note modal-note pre-payment-note">
                  <strong>Não precisa enviar comprovante no WhatsApp. ☺️</strong>
                  <span>
                    Depois de pagar no app do banco, volte para esta tela e toque
                    no botão de liberar fotos. A liberação é automática.
                  </span>
                </div>
                {pixPayment?.qrCodeBase64 ? (
                  <img
                    alt="QR Code Pix"
                    className="pix-qr-image"
                    src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                  />
                ) : (
                  <div className="fake-pix-code" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <strong>PIX</strong>
                  </div>
                )}
                {pixPayment?.qrCode && (
                  <button
                    className={`copy-pix-button ${pixCopied ? "copied" : ""}`}
                    onClick={copyPixCode}
                    type="button"
                  >
                    {pixCopied ? "Pix copiado! Abra seu banco" : "Copiar Pix Copia e Cola"}
                  </button>
                )}
                <button
                  className="primary-button modal-primary"
                  disabled={checkingPayment}
                  onClick={checkPaymentAndRelease}
                  type="button"
                >
                  {checkingPayment ? "Conferindo..." : "Já paguei, liberar fotos"}
                </button>
                <button
                  className="text-button muted"
                  onClick={() => setPixReady(false)}
                  type="button"
                >
                  Voltar para escolher fotos
                </button>
                {checkoutError && <p className="form-error">{checkoutError}</p>}
              </>
            ) : (
              <>
                <span className="modal-badge">
                  {selectionIsIncluded
                    ? "Crédito reconhecido"
                    : "Revise seu pedido"}
                </span>
                <h2 id="checkout-title">
                  {selectionIsIncluded
                    ? "Veja suas fotos ganharem movimento."
                    : `${selected.length} fotos selecionadas`}
                </h2>
                <p>
                  Complete seu pedido com extras que deixam suas fotos mais
                  úteis para perfil, WhatsApp, currículo, status e redes sociais.
                </p>
                {isProfessionalGallery && (
                  <>
                    <div className="video-offer-preview pack-offer-preview">
                      <div
                        aria-label="Prévia das fotos usadas no Pack Primeira Impressão"
                        className={`video-photo-strip pack-photo-strip count-${Math.min(firstImpressionPackPhotos.length, 3)}`}
                      >
                        {firstImpressionPackPhotos.map((photo, index) => {
                          const tone =
                            "tone" in photo && typeof photo.tone === "number"
                              ? photo.tone
                              : 0;

                          return (
                            <span
                              key={`${photo.id}-${index}`}
                              style={{
                                background: photo.previewUrl
                                  ? `center / cover no-repeat url("${photo.previewUrl}")`
                                  : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                              }}
                            />
                          );
                        })}
                        <strong aria-hidden="true">+3</strong>
                      </div>
                      <div className="video-benefits">
                        <strong>Pack Primeira Impressão</strong>
                        <span>
                          +3 variações extras das melhores fotos.
                        </span>
                        <span>
                          1 Versão Autoridade — para passar mais confiança.
                        </span>
                        <span>
                          1 Versão Simpatia — para parecer mais acessível
                          quando a ocasião pede.
                        </span>
                        <span>
                          1 Versão Premium — para elevar ainda mais sua imagem
                          profissional em certos ambientes.
                        </span>
                      </div>
                    </div>
                    <button
                      aria-pressed={firstImpressionPackAdded}
                      className={`addon-card pack-addon ${
                        firstImpressionPackAdded ? "selected" : ""
                      }`}
                      onClick={() => {
                        if (firstImpressionPackAdded) return;

                        if (!firstImpressionPackPhotoIds.length) {
                          setFirstImpressionPackPhotoIds(selected.slice(0, 1));
                        }
                        setFirstImpressionPackAdded(true);
                      }}
                      type="button"
                    >
                      <span className="addon-check">
                        {firstImpressionPackAdded ? "✓" : "+"}
                      </span>
                      <span className="addon-copy">
                        <strong>
                          {firstImpressionPackAdded
                            ? "Pack Primeira Impressão adicionado"
                            : "Quero o Pack Primeira Impressão"}
                        </strong>
                        <small>
                          {firstImpressionPackAdded
                            ? `${effectiveFirstImpressionPackPhotoIds.length} ${
                                effectiveFirstImpressionPackPhotoIds.length === 1
                                  ? "foto escolhida"
                                  : "fotos escolhidas"
                              } recebendo +3 variações cada`
                            : `Escolha suas melhores fotos e receba 3 versões extras de impacto por ${money.format(
                                offer.firstImpressionPackPrice,
                              )} por foto.`}
                        </small>
                      </span>
                      <span
                        className="addon-action"
                        onClick={(event) => {
                          if (!firstImpressionPackAdded) return;
                          event.stopPropagation();
                          setFirstImpressionPackAdded(false);
                        }}
                        role={firstImpressionPackAdded ? "button" : undefined}
                      >
                        {firstImpressionPackAdded ? "REMOVER" : "ADICIONAR"}
                      </span>
                    </button>
                    {firstImpressionPackAdded && selected.length > 1 && (
                      <div className="video-photo-choice">
                        <div className="modal-total">
                          <span>
                            {effectiveFirstImpressionPackPhotoIds.length}{" "}
                            {effectiveFirstImpressionPackPhotoIds.length === 1
                              ? "foto no Pack"
                              : "fotos no Pack"}
                          </span>
                          <strong>{money.format(firstImpressionPackPrice)}</strong>
                        </div>
                        {effectiveFirstImpressionPackPhotoIds.length <
                          selected.length && (
                          <button
                            className="addon-choice-action primary"
                            onClick={() => setFirstImpressionPackPhotoIds(selected)}
                            type="button"
                          >
                            Aplicar Pack em todas as fotos selecionadas
                          </button>
                        )}
                        <button
                          className="addon-choice-action secondary"
                          onClick={() =>
                            setFirstImpressionPackPickerOpen((current) => !current)
                          }
                          type="button"
                        >
                          {firstImpressionPackPickerOpen
                            ? "Concluir escolha"
                            : "Escolher quais fotos recebem o Pack"}
                        </button>
                        {firstImpressionPackPickerOpen && (
                          <>
                            <small>
                              Já deixamos 1 foto marcada. Toque nas outras fotos
                              para criar as versões Autoridade, Simpatia e Premium.
                            </small>
                            <div className="video-picker-grid pack-picker-grid">
                              {selected.map((photoId) => {
                                const photo = photos.find(
                                  (item) => item.id === photoId,
                                );
                                if (!photo) return null;
                                const active =
                                  effectiveFirstImpressionPackPhotoIds.includes(
                                    photoId,
                                  );
                                const tone =
                                  "tone" in photo &&
                                  typeof photo.tone === "number"
                                    ? photo.tone
                                    : 0;

                                return (
                                  <button
                                    aria-label={`${active ? "Remover" : "Usar"} foto ${photo.number} no Pack Primeira Impressão`}
                                    aria-pressed={active}
                                    className={active ? "selected" : ""}
                                    key={photo.id}
                                    onClick={() =>
                                      toggleFirstImpressionPackPhoto(photo.id)
                                    }
                                    style={{
                                      background: photo.previewUrl
                                        ? `center / cover no-repeat url("${photo.previewUrl}")`
                                        : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                                    }}
                                    type="button"
                                  >
                                    <span>{active ? "✓" : "+"}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div className="video-offer-preview">
                  <div
                    aria-label="Prévia das fotos usadas no vídeo"
                    className={`video-photo-strip count-${Math.min(videoPhotos.length, 3)}`}
                  >
                    {videoPhotos.map((photo, index) => {
                      const tone =
                        "tone" in photo && typeof photo.tone === "number"
                          ? photo.tone
                          : 0;

                      return (
                        <span
                          key={`${photo.id}-${index}`}
                          style={{
                            background: photo.previewUrl
                              ? `center / cover no-repeat url("${photo.previewUrl}")`
                              : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                          }}
                        />
                      );
                    })}
                    <strong aria-hidden="true">▶</strong>
                  </div>
                  <div className="video-benefits">
                    <strong>Pack de Vídeos</strong>
                    {videoAdded && (
                      <span>
                        {videoPhotoIds.length}{" "}
                        {videoPhotoIds.length === 1
                          ? "vídeo curto"
                          : "vídeos curtos"}
                      </span>
                    )}
                    <span>Transforme foto parada em conteúdo com movimento</span>
                    <span>Ideal para chamar atenção no status, story e Reels</span>
                  </div>
                </div>
                <button
                  aria-pressed={videoAdded}
                  className={`addon-card ${videoAdded ? "selected" : ""}`}
                  onClick={() => {
                    if (videoAdded) return;
                    setVideoAdded(true);
                  }}
                  type="button"
                >
                  <span className="addon-check">{videoAdded ? "✓" : "+"}</span>
                  <span className="addon-copy">
                    <strong>Quero minha foto em vídeo</strong>
                    <small>
                      {videoAdded
                        ? `${videoPhotoIds.length} ${videoPhotoIds.length === 1 ? "foto escolhida" : "fotos escolhidas"} para vídeo`
                        : "Dê movimento à foto e deixe o resultado mais chamativo"}
                    </small>
                  </span>
                  <span
                    className="addon-action"
                    onClick={(event) => {
                      if (!videoAdded) return;
                      event.stopPropagation();
                      setVideoAdded(false);
                    }}
                    role={videoAdded ? "button" : undefined}
                  >
                    {videoAdded ? "REMOVER" : "ADICIONAR"}
                  </span>
                </button>
                {videoAdded && selected.length > 1 && (
                  <div className="video-photo-choice">
                    <div className="modal-total">
                      <span>
                        {videoPhotoIds.length}{" "}
                        {videoPhotoIds.length === 1 ? "vídeo escolhido" : "vídeos escolhidos"}
                      </span>
                      <strong>{money.format(videoPrice)}</strong>
                    </div>
                    {videoPhotoIds.length < selected.length && (
                      <button
                        className="addon-choice-action primary"
                        onClick={() => setVideoPhotoIds(selected)}
                        type="button"
                      >
                        Transformar todas as fotos selecionadas em vídeo
                      </button>
                    )}
                    <button
                      className="addon-choice-action secondary"
                      onClick={() => setVideoPickerOpen((current) => !current)}
                      type="button"
                    >
                      {videoPickerOpen
                        ? "Concluir escolha"
                        : "Escolher quais fotos viram vídeo"}
                    </button>
                    {videoPickerOpen && (
                      <>
                        <small>
                          Já deixamos 1 foto marcada. Toque nas outras fotos
                          para transformar mais delas em vídeo.
                        </small>
                        <div className="video-picker-grid">
                          {selected.map((photoId) => {
                            const photo = photos.find(
                              (item) => item.id === photoId,
                            );
                            if (!photo) return null;
                            const active = videoPhotoIds.includes(photoId);
                            const tone =
                              "tone" in photo &&
                              typeof photo.tone === "number"
                                ? photo.tone
                                : 0;

                            return (
                              <button
                                aria-label={`${active ? "Remover" : "Usar"} foto ${photo.number} no vídeo`}
                                aria-pressed={active}
                                className={active ? "selected" : ""}
                                key={photo.id}
                                onClick={() => toggleVideoPhoto(photo.id)}
                                style={{
                                  background: photo.previewUrl
                                    ? `center / cover no-repeat url("${photo.previewUrl}")`
                                    : `linear-gradient(145deg, hsl(${tone} 34% 25%), hsl(${tone + 42} 46% 68%))`,
                                }}
                                type="button"
                              >
                                <span>{active ? "✓" : "+"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="modal-total">
                  <span>
                    {[
                      pricing.dueNow > 0
                        ? `Fotos adicionais: ${money.format(pricing.dueNow)}`
                        : selectionOnlyUnlocked
                          ? "Fotos já liberadas"
                          : "Fotos escolhidas já incluídas",
                      firstImpressionPackAdded && firstImpressionPackPrice > 0
                        ? `${effectiveFirstImpressionPackPhotoIds.length} ${
                            effectiveFirstImpressionPackPhotoIds.length === 1
                              ? "Pack"
                              : "Packs"
                          } Primeira Impressão: ${money.format(
                            firstImpressionPackPrice,
                          )}`
                        : null,
                      videoAdded && videoPrice > 0
                        ? `${videoPhotoIds.length} ${videoPhotoIds.length === 1 ? "vídeo" : "vídeos"}: ${money.format(videoPrice)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <strong>
                    {checkoutAmount > 0
                      ? `Pagar ${money.format(checkoutAmount)}`
                      : "Sem valor adicional"}
                  </strong>
                </div>
                <button
                  className="primary-button modal-primary"
                  disabled={
                    releasing || creatingPix || manualReleasing || manualBlocking
                  }
                  onClick={continueCheckout}
                  type="button"
                >
                  {creatingPix
                    ? "Gerando Pix..."
                    : releasing
                    ? "Liberando..."
                    : checkoutAmount > 0
                    ? "Continuar para o Pix"
                    : "Liberar minhas fotos"}
                </button>
                {checkoutError && <p className="form-error">{checkoutError}</p>}
              </>
            )}
          </section>
        </div>
      )}
      <section className="manual-release-footer" aria-label="Liberação manual">
        <button
          className="manual-release-toggle"
          onClick={() => setManualReleaseOpen((current) => !current)}
          type="button"
        >
          Liberação manual
        </button>
        {manualReleaseOpen && (
          <div className="manual-release-box">
            <p>
              Selecione as fotos na galeria, digite a senha e libere sem Pix.
            </p>
            <div>
              <input
                autoComplete="off"
                onChange={(event) => setManualPassword(event.target.value)}
                placeholder="Senha de liberação"
                type="password"
                value={manualPassword}
              />
              <button
                className="secondary-button"
                disabled={
                  manualReleasing ||
                  manualBlocking ||
                  releasing ||
                  creatingPix
                }
                onClick={() => void releaseSelectedPhotos(true)}
                type="button"
              >
                {manualReleasing ? "Liberando..." : "Liberar com senha"}
              </button>
              <button
                className="secondary-button"
                disabled={
                  manualReleasing ||
                  manualBlocking ||
                  releasing ||
                  creatingPix
                }
                onClick={() => void blockSelectedPhotos()}
                type="button"
              >
                {manualBlocking ? "Bloqueando..." : "Bloquear com senha"}
              </button>
            </div>
            {checkoutError && <p className="form-error">{checkoutError}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
