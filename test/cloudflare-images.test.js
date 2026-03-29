import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESET_WIDTHS,
  buildImageAttributes,
  buildSrcSet,
  buildTransformUrl,
  getPresetWidths,
  isAllowedWidth,
} from "../src/lib/cloudflare-images.js";

test("buildTransformUrl uses the fixed Cloudflare option order", () => {
  const url = buildTransformUrl({
    baseUrl: "https://img.example.com/",
    key: "photos/2026/03/example image.jpg",
    width: 960,
  });

  assert.equal(
    url,
    "https://img.example.com/cdn-cgi/image/format=auto,metadata=none,fit=scale-down,width=960,quality=85/photos/2026/03/example%20image.jpg",
  );
});

test("buildSrcSet uses the preset whitelist", () => {
  const srcset = buildSrcSet({
    baseUrl: "https://img.example.com",
    key: "photos/2026/03/example.jpg",
    preset: "card",
  });

  assert.match(srcset, /width=480/);
  assert.match(srcset, /width=960/);
  assert.match(srcset, /width=1440/);
});

test("buildImageAttributes defaults to lazy loading for non-priority images", () => {
  const attrs = buildImageAttributes({
    baseUrl: "https://img.example.com",
    key: "photos/2026/03/example.jpg",
    preset: "thumb",
    sizes: "100vw",
    width: 640,
    height: 480,
  });

  assert.equal(attrs.loading, "lazy");
  assert.equal(attrs.fetchpriority, "auto");
  assert.equal(attrs.decoding, "async");
});

test("preset helpers expose only the approved widths", () => {
  assert.deepEqual(getPresetWidths("hero"), PRESET_WIDTHS.hero);
  assert.equal(isAllowedWidth(320), true);
  assert.equal(isAllowedWidth(1234), false);
});

test("preset helpers clamp srcset widths to the source width", () => {
  assert.deepEqual(getPresetWidths("card", { maxWidth: 700 }), [480]);

  const attrs = buildImageAttributes({
    baseUrl: "https://img.example.com",
    key: "photos/2026/03/example.jpg",
    preset: "hero",
    sizes: "100vw",
    width: 900,
    height: 600,
    sourceWidth: 900,
  });

  assert.match(attrs.srcset, /width=768/);
  assert.doesNotMatch(attrs.srcset, /width=1280/);
});

test("buildTransformUrl rejects non-whitelisted widths", () => {
  assert.throws(
    () =>
      buildTransformUrl({
        baseUrl: "https://img.example.com",
        key: "photos/2026/03/example.jpg",
        width: 777,
      }),
    /not in the allowed Cloudflare preset list/,
  );
});
