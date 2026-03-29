const CONTENT_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
]);

export function getContentTypeForExtension(extension) {
  const normalized = extension.toLowerCase();
  const contentType = CONTENT_TYPES.get(normalized);

  if (!contentType) {
    throw new Error(`Unsupported extension: ${extension}`);
  }

  return contentType;
}
