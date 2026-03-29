import test from "node:test";
import assert from "node:assert/strict";

import { slugify } from "../src/lib/slug.js";

test("slugify normalizes mixed punctuation and spaces", () => {
  assert.equal(slugify("My Summer Photo 01!.JPG"), "my-summer-photo-01jpg");
});

test("slugify falls back to image when nothing remains", () => {
  assert.equal(slugify("////"), "image");
});
