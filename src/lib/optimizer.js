import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import {
  ALLOWED_INPUT_EXTENSIONS,
  DEFAULT_CACHE_CONTROL,
  DEFAULT_JPEG_QUALITY,
  DEFAULT_MAX_LONG_EDGE,
  DEFAULT_PHOTO_FORMAT,
  DEFAULT_TRANSFORM_QUALITY,
  MAX_PHOTO_QUALITY,
  MIN_PHOTO_QUALITY,
  PRESET_WIDTHS,
} from "./constants.js";
import { sha256Hex } from "./hash.js";
import { getContentTypeForExtension } from "./mime.js";
import { slugify } from "./slug.js";

export async function optimizeDirectory({
  inputDir,
  outputDir,
  keyPrefix = "photos",
  maxLongEdge = DEFAULT_MAX_LONG_EDGE,
  photoFormat = DEFAULT_PHOTO_FORMAT,
  photoQuality = DEFAULT_JPEG_QUALITY,
  jpegQuality = DEFAULT_JPEG_QUALITY,
  now = new Date(),
}) {
  const normalizedPhotoFormat = normalizePhotoFormat(photoFormat);
  const normalizedPhotoQuality = normalizePhotoQuality(photoQuality ?? jpegQuality);
  const files = await listImageFiles(inputDir);
  const items = [];

  for (const inputPath of files) {
    const result = await optimizeAsset({
      inputPath,
      inputDir,
      outputDir,
      keyPrefix,
      maxLongEdge,
      photoFormat: normalizedPhotoFormat,
      photoQuality: normalizedPhotoQuality,
      now,
    });

    items.push(result);
  }

  return createManifest({
    inputDir,
    outputDir,
    maxLongEdge,
    photoFormat: normalizedPhotoFormat,
    photoQuality: normalizedPhotoQuality,
    items,
  });
}

export async function writeManifest(manifestPath, manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function optimizeAsset({
  inputPath,
  inputDir,
  outputDir,
  keyPrefix,
  maxLongEdge,
  photoFormat,
  photoQuality,
  now,
}) {
  const sourceBuffer = await readFile(inputPath);
  const extension = path.extname(inputPath).toLowerCase();
  const basename = path.basename(inputPath, extension);
  const slug = slugify(basename);
  const pipeline = sharp(sourceBuffer, {
    animated: true,
    failOn: "none",
    sequentialRead: true,
  });
  const metadata = await pipeline.metadata();

  let outputBuffer;
  let outputInfo;
  let outputExtension;
  let strategy;

  if (extension === ".svg") {
    outputBuffer = sourceBuffer;
    outputInfo = {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      format: "svg",
    };
    outputExtension = ".svg";
    strategy = "svg-pass-through";
  } else if (metadata.pages && metadata.pages > 1) {
    outputBuffer = sourceBuffer;
    outputInfo = {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      format: metadata.format ?? extension.slice(1),
    };
    outputExtension = extension === ".jpeg" ? ".jpg" : extension;
    strategy = "animated-pass-through";
  } else {
    const transformed = sharp(sourceBuffer, {
      failOn: "none",
      sequentialRead: true,
    }).rotate();

    if ((metadata.width ?? 0) > 0 && (metadata.height ?? 0) > 0) {
      transformed.resize({
        width: metadata.width >= metadata.height ? maxLongEdge : undefined,
        height: metadata.height > metadata.width ? maxLongEdge : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (metadata.hasAlpha) {
      const pngResult = await transformed
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: false,
        })
        .toBuffer({ resolveWithObject: true });

      outputBuffer = await tryOxipng(pngResult.data);
      outputInfo = await sharp(outputBuffer, { failOn: "none" }).metadata();
      outputExtension = ".png";
      strategy = "png-lossless";
    } else {
      const encodedPhoto = await encodePhoto(transformed, {
        photoFormat,
        photoQuality,
      });

      outputBuffer = encodedPhoto.data;
      outputInfo = encodedPhoto.info;
      outputExtension = encodedPhoto.extension;
      strategy = encodedPhoto.strategy;
    }
  }

  const hash = sha256Hex(outputBuffer).slice(0, 12);
  const datedPrefix = createDatedPrefix(keyPrefix, now);
  const key = `${datedPrefix}/${slug}-${hash}${outputExtension}`;
  const outputPath = path.join(outputDir, ...key.split("/"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputBuffer);

  return {
    sourcePath: normalizeForManifest(path.relative(process.cwd(), inputPath) || inputPath),
    sourceRelativePath: normalizeForManifest(path.relative(inputDir, inputPath)),
    outputPath: normalizeForManifest(path.relative(process.cwd(), outputPath) || outputPath),
    key,
    strategy,
    hash,
    format: normalizeFormat(outputExtension),
    contentType: getContentTypeForExtension(outputExtension),
    width: outputInfo.width ?? null,
    height: outputInfo.height ?? null,
    originalBytes: sourceBuffer.byteLength,
    optimizedBytes: outputBuffer.byteLength,
    savedBytes: Math.max(0, sourceBuffer.byteLength - outputBuffer.byteLength),
    savingsRatio: Number(
      Math.max(0, (sourceBuffer.byteLength - outputBuffer.byteLength) / sourceBuffer.byteLength).toFixed(4),
    ),
  };
}

async function listImageFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listImageFiles(absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();

    if (ALLOWED_INPUT_EXTENSIONS.has(extension)) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function tryOxipng(buffer) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "r2-bucket-tool-"));
  const tempPath = path.join(tempDir, "image.png");

  try {
    await writeFile(tempPath, buffer);

    const result = spawnSync("oxipng", ["-o", "4", "--strip", "all", tempPath], {
      stdio: "ignore",
      windowsHide: true,
    });

    if (result.error || result.status !== 0) {
      return buffer;
    }

    return await readFile(tempPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createManifest({ inputDir, outputDir, maxLongEdge, photoFormat, photoQuality, items }) {
  const totalOriginalBytes = items.reduce((sum, item) => sum + item.originalBytes, 0);
  const totalOptimizedBytes = items.reduce((sum, item) => sum + item.optimizedBytes, 0);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    inputDir: normalizeForManifest(path.resolve(inputDir)),
    outputDir: normalizeForManifest(path.resolve(outputDir)),
    defaults: {
      maxLongEdge,
      photoFormat,
      photoQuality,
      jpegQuality: photoFormat === "jpeg" ? photoQuality : DEFAULT_JPEG_QUALITY,
      transformQuality: DEFAULT_TRANSFORM_QUALITY,
      cacheControl: DEFAULT_CACHE_CONTROL,
      presets: PRESET_WIDTHS,
    },
    summary: {
      totalFiles: items.length,
      totalOriginalBytes,
      totalOptimizedBytes,
      totalSavedBytes: Math.max(0, totalOriginalBytes - totalOptimizedBytes),
      totalSavingsRatio: totalOriginalBytes
        ? Number(Math.max(0, (totalOriginalBytes - totalOptimizedBytes) / totalOriginalBytes).toFixed(4))
        : 0,
    },
    items,
  };
}

function createDatedPrefix(keyPrefix, now) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return [keyPrefix, String(year), month].join("/");
}

function normalizeFormat(extension) {
  return extension.replace(/^\./u, "").replace(/^jpeg$/u, "jpg");
}

function normalizeForManifest(value) {
  return value.split(path.sep).join("/");
}

async function encodePhoto(image, { photoFormat, photoQuality }) {
  if (photoFormat === "webp") {
    const webpResult = await image
      .webp({
        quality: photoQuality,
        effort: 5,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      data: webpResult.data,
      info: webpResult.info,
      extension: ".webp",
      strategy: "webp-master",
    };
  }

  const jpegResult = await image
    .jpeg({
      quality: photoQuality,
      progressive: true,
      mozjpeg: true,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    data: jpegResult.data,
    info: jpegResult.info,
    extension: ".jpg",
    strategy: "jpeg-master",
  };
}

function normalizePhotoFormat(value) {
  const normalized = String(value || DEFAULT_PHOTO_FORMAT).trim().toLowerCase();

  if (normalized === "jpeg" || normalized === "jpg") {
    return "jpeg";
  }

  if (normalized === "webp") {
    return "webp";
  }

  throw new Error(`Unsupported photo format: ${value}`);
}

function normalizePhotoQuality(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid photo quality: ${value}`);
  }

  return Math.min(MAX_PHOTO_QUALITY, Math.max(MIN_PHOTO_QUALITY, Math.round(numeric)));
}
