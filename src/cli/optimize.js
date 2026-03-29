#!/usr/bin/env node

import path from "node:path";

import { parseArgs, printUsage, getNumberArg } from "../lib/cli.js";
import {
  DEFAULT_JPEG_QUALITY,
  DEFAULT_MAX_LONG_EDGE,
  DEFAULT_PHOTO_FORMAT,
  MAX_PHOTO_QUALITY,
  MIN_PHOTO_QUALITY,
} from "../lib/constants.js";
import { optimizeDirectory, writeManifest } from "../lib/optimizer.js";

async function main() {
  const args = parseArgs();

  if (args.help) {
    printUsage([
      "Usage: node src/cli/optimize.js --input ./input --output ./dist/images [options]",
      "",
      "Options:",
      "  --input <dir>          Source image directory",
      "  --output <dir>         Output directory for optimized assets",
      "  --manifest <path>      Manifest output path, defaults to <output>/manifest.json",
      "  --prefix <prefix>      R2 key prefix, defaults to photos",
      `  --max-long-edge <n>    Defaults to ${DEFAULT_MAX_LONG_EDGE}`,
      `  --photo-format <name>  jpeg or webp, defaults to ${DEFAULT_PHOTO_FORMAT}`,
      `  --photo-quality <n>    ${MIN_PHOTO_QUALITY}-${MAX_PHOTO_QUALITY}, defaults to ${DEFAULT_JPEG_QUALITY}`,
      `  --jpeg-quality <n>     Legacy alias for --photo-quality`,
      "  --help                 Show this message",
    ]);
    return;
  }

  const inputDir = path.resolve(String(args.input || "./input"));
  const outputDir = path.resolve(String(args.output || "./dist/images"));
  const manifestPath = path.resolve(String(args.manifest || path.join(outputDir, "manifest.json")));
  const keyPrefix = String(args.prefix || "photos");
  const maxLongEdge = getNumberArg(args, "max-long-edge", DEFAULT_MAX_LONG_EDGE);
  const photoFormat = String(args["photo-format"] || DEFAULT_PHOTO_FORMAT);
  const photoQuality = getNumberArg(args, "photo-quality", getNumberArg(args, "jpeg-quality", DEFAULT_JPEG_QUALITY));

  const manifest = await optimizeDirectory({
    inputDir,
    outputDir,
    keyPrefix,
    maxLongEdge,
    photoFormat,
    photoQuality,
  });

  await writeManifest(manifestPath, manifest);

  console.log(`Optimized ${manifest.summary.totalFiles} file(s).`);
  console.log(`Original bytes: ${manifest.summary.totalOriginalBytes}`);
  console.log(`Optimized bytes: ${manifest.summary.totalOptimizedBytes}`);
  console.log(`Saved bytes: ${manifest.summary.totalSavedBytes}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
