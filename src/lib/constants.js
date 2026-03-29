export const DEFAULT_MAX_LONG_EDGE = 3200;
export const DEFAULT_JPEG_QUALITY = 88;
export const DEFAULT_PHOTO_FORMAT = "jpeg";
export const MIN_PHOTO_QUALITY = 40;
export const MAX_PHOTO_QUALITY = 88;
export const DEFAULT_TRANSFORM_QUALITY = 85;
export const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const PRESET_WIDTHS = Object.freeze({
  thumb: Object.freeze([320, 640]),
  card: Object.freeze([480, 960, 1440]),
  hero: Object.freeze([768, 1280, 1920, 2560]),
});

export const DEFAULT_TRANSFORM_OPTIONS = Object.freeze({
  format: "auto",
  metadata: "none",
  fit: "scale-down",
  quality: DEFAULT_TRANSFORM_QUALITY,
});

export const ALLOWED_INPUT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".tif",
  ".tiff",
  ".svg",
]);
