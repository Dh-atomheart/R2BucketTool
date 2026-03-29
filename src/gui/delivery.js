import { buildImageAttributes, PRESET_WIDTHS } from "../lib/cloudflare-images.js";

export const PRESET_SIZES = Object.freeze({
  thumb: "100vw",
  card: "(max-width: 768px) 100vw, 50vw",
  hero: "100vw",
});

export function buildDeliveryBundle({ baseUrl, key, width, height, uploaded = false }) {
  if (!baseUrl || !key) {
    return null;
  }

  const sourceUrl = `${normalizeBaseUrl(baseUrl)}/${encodeObjectKey(key)}`;
  const transformTemplate = `${normalizeBaseUrl(
    baseUrl,
  )}/cdn-cgi/image/format=auto,metadata=none,fit=scale-down,width=<W>,quality=85/${encodeObjectKey(key)}`;
  const presets = {};

  for (const preset of Object.keys(PRESET_WIDTHS)) {
    const attrs = buildImageAttributes({
      baseUrl,
      key,
      preset,
      sizes: PRESET_SIZES[preset],
      width,
      height,
      sourceWidth: width,
      priority: preset === "hero",
    });

    presets[preset] = {
      preset,
      sizes: PRESET_SIZES[preset],
      src: attrs.src,
      srcset: attrs.srcset,
      width: attrs.width,
      height: attrs.height,
      loading: attrs.loading,
      decoding: attrs.decoding,
      fetchpriority: attrs.fetchpriority,
      html: buildHtmlSnippet(attrs),
    };
  }

  return {
    uploaded,
    sourceUrl,
    transformTemplate,
    presets,
  };
}

function buildHtmlSnippet(attrs) {
  const lines = ['<img'];
  const orderedAttrs = [
    ["src", attrs.src],
    ["srcset", attrs.srcset],
    ["sizes", attrs.sizes],
    ["width", attrs.width],
    ["height", attrs.height],
    ["loading", attrs.loading],
    ["decoding", attrs.decoding],
    ["fetchpriority", attrs.fetchpriority],
    ["alt", ""],
  ];

  for (const [name, value] of orderedAttrs) {
    if (value == null || value === "") {
      continue;
    }

    lines.push(`  ${name}="${escapeAttribute(String(value))}"`);
  }

  lines.push("/>");

  return lines.join("\n");
}

function escapeAttribute(value) {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;");
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/u, "");
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
