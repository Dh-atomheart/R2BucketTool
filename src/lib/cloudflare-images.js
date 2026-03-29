import { DEFAULT_TRANSFORM_OPTIONS, PRESET_WIDTHS } from "./constants.js";

const ALL_ALLOWED_WIDTHS = new Set(Object.values(PRESET_WIDTHS).flat());

export { PRESET_WIDTHS };

export function isAllowedWidth(width) {
  return ALL_ALLOWED_WIDTHS.has(Number(width));
}

export function getPresetWidths(preset, options = {}) {
  const widths = PRESET_WIDTHS[preset];

  if (!widths) {
    throw new Error(`Unknown image preset: ${preset}`);
  }

  const maxWidth = Number(options.maxWidth);

  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return [...widths];
  }

  const filtered = widths.filter((width) => width <= maxWidth);

  return filtered.length > 0 ? filtered : [widths[0]];
}

export function buildTransformUrl({
  baseUrl,
  key,
  width,
  format = DEFAULT_TRANSFORM_OPTIONS.format,
  metadata = DEFAULT_TRANSFORM_OPTIONS.metadata,
  fit = DEFAULT_TRANSFORM_OPTIONS.fit,
  quality = DEFAULT_TRANSFORM_OPTIONS.quality,
}) {
  const normalizedWidth = Number(width);

  if (!Number.isInteger(normalizedWidth) || normalizedWidth <= 0) {
    throw new Error(`Invalid width: ${width}`);
  }

  if (!isAllowedWidth(normalizedWidth)) {
    throw new Error(`Width ${normalizedWidth} is not in the allowed Cloudflare preset list`);
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const params = [
    `format=${format}`,
    `metadata=${metadata}`,
    `fit=${fit}`,
    `width=${normalizedWidth}`,
    `quality=${Number(quality)}`,
  ].join(",");

  return `${normalizedBaseUrl}/cdn-cgi/image/${params}/${encodeObjectKey(key)}`;
}

export function buildSrcSet({
  baseUrl,
  key,
  preset,
  sourceWidth,
  format,
  metadata,
  fit,
  quality,
}) {
  return getPresetWidths(preset, { maxWidth: sourceWidth })
    .map((width) => {
      const url = buildTransformUrl({
        baseUrl,
        key,
        width,
        format,
        metadata,
        fit,
        quality,
      });

      return `${url} ${width}w`;
    })
    .join(", ");
}

export function buildImageAttributes({
  baseUrl,
  key,
  preset,
  sizes,
  width,
  height,
  sourceWidth,
  priority = false,
  quality,
  format,
  metadata,
  fit,
}) {
  const widths = getPresetWidths(preset, { maxWidth: sourceWidth ?? width });
  const largestWidth = widths[widths.length - 1];

  return {
    src: buildTransformUrl({
      baseUrl,
      key,
      width: largestWidth,
      quality,
      format,
      metadata,
      fit,
    }),
    srcset: buildSrcSet({
      baseUrl,
      key,
      preset,
      sourceWidth: sourceWidth ?? width,
      quality,
      format,
      metadata,
      fit,
    }),
    sizes,
    width,
    height,
    loading: priority ? "eager" : "lazy",
    decoding: "async",
    fetchpriority: priority ? "high" : "auto",
  };
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new Error("baseUrl is required");
  }

  return baseUrl.replace(/\/+$/u, "");
}

function encodeObjectKey(key) {
  if (!key) {
    throw new Error("key is required");
  }

  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
