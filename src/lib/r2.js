import { readFile } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { DEFAULT_CACHE_CONTROL } from "./constants.js";

export function createR2ClientFromEnv(env = process.env) {
  const accountId = requiredEnv(env, "R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv(env, "R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function uploadManifestItems({
  manifest,
  outputRoot,
  dryRun = false,
  concurrency = 4,
  env = process.env,
}) {
  const bucket = requiredEnv(env, "R2_BUCKET");
  const cacheControl = env.R2_CACHE_CONTROL || DEFAULT_CACHE_CONTROL;
  const publicBaseUrl = normalizeBaseUrl(env.R2_PUBLIC_BASE_URL || "");
  const client = dryRun ? null : createR2ClientFromEnv(env);
  const items = [...manifest.items];
  const results = [];

  let index = 0;

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;

        const item = items[currentIndex];
        const absolutePath = path.resolve(outputRoot, ...item.key.split("/"));
        const body = await readFile(absolutePath);

        if (!dryRun) {
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: item.key,
              Body: body,
              ContentType: item.contentType,
              CacheControl: cacheControl,
            }),
          );
        }

        results[currentIndex] = {
          ...item,
          sourceUrl: publicBaseUrl ? `${publicBaseUrl}/${encodeObjectKey(item.key)}` : null,
          transformTemplate: publicBaseUrl
            ? `${publicBaseUrl}/cdn-cgi/image/format=auto,metadata=none,fit=scale-down,width=<W>,quality=85/${encodeObjectKey(
                item.key,
              )}`
            : null,
          uploaded: !dryRun,
        };
      }
    }),
  );

  return {
    ...manifest,
    uploadedAt: new Date().toISOString(),
    dryRun,
    bucket,
    publicBaseUrl: publicBaseUrl || null,
    items: results,
  };
}

function requiredEnv(env, key) {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
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
