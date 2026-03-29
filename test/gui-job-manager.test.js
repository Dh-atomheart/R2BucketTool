import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";

import sharp from "sharp";

import { JobManager } from "../src/gui/job-manager.js";

test("JobManager optimizes and uploads with a fake uploader", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "r2bt-job-"));

  try {
    const manager = new JobManager({
      rootDir,
      uploadManifestItemsFn: async ({ manifest, env }) => ({
        ...manifest,
        uploadedAt: new Date().toISOString(),
        dryRun: false,
        bucket: env.R2_BUCKET,
        publicBaseUrl: env.R2_PUBLIC_BASE_URL,
        items: manifest.items.map((item) => ({
          ...item,
          sourceUrl: `${env.R2_PUBLIC_BASE_URL}/${item.key}`,
          transformTemplate: `${env.R2_PUBLIC_BASE_URL}/cdn-cgi/image/format=auto,metadata=none,fit=scale-down,width=<W>,quality=85/${item.key}`,
          uploaded: true,
        })),
      }),
    });
    const job = await manager.createJob();

    await sharp({
      create: {
        width: 1400,
        height: 900,
        channels: 3,
        background: { r: 210, g: 180, b: 140 },
      },
    })
      .jpeg({ quality: 92 })
      .toFile(path.join(job.paths.input, "hero.jpg"));

    const readyJob = await manager.runOptimization(job.id, {
      config: {
        R2_KEY_PREFIX: "photos",
        R2_PUBLIC_BASE_URL: "https://img.example.com",
      },
      options: {
        photoFormat: "webp",
        photoQuality: 54,
      },
    });

    assert.equal(readyJob.status, "ready");
    assert.equal(readyJob.items.length, 1);
    assert.equal(readyJob.defaults.photoFormat, "webp");
    assert.equal(readyJob.defaults.photoQuality, 54);
    assert.equal(readyJob.items[0].format, "webp");
    assert.equal(readyJob.items[0].delivery.presets.card.src.includes("width=960"), true);

    const uploadedJob = await manager.runUpload(job.id, {
      config: {
        R2_BUCKET: "demo-bucket",
        R2_PUBLIC_BASE_URL: "https://img.example.com",
      },
    });

    assert.equal(uploadedJob.status, "uploaded");
    assert.equal(uploadedJob.items[0].delivery.uploaded, true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("JobManager rejects overlapping optimization runs", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "r2bt-job-busy-"));
  let release;

  try {
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const manager = new JobManager({
      rootDir,
      optimizeDirectoryFn: async () => {
        await gate;
        return {
          version: 1,
          generatedAt: new Date().toISOString(),
          inputDir: "input",
          outputDir: "output",
          defaults: {},
          summary: { totalFiles: 1, totalOriginalBytes: 1, totalOptimizedBytes: 1, totalSavedBytes: 0, totalSavingsRatio: 0 },
          items: [
            {
              sourcePath: "input/example.jpg",
              sourceRelativePath: "example.jpg",
              outputPath: "output/photos/example.jpg",
              key: "photos/example.jpg",
              strategy: "jpeg-master",
              hash: "abc123",
              format: "jpg",
              contentType: "image/jpeg",
              width: 100,
              height: 100,
              originalBytes: 1,
              optimizedBytes: 1,
              savedBytes: 0,
              savingsRatio: 0,
            },
          ],
        };
      },
    });
    const firstJob = await manager.createJob();
    const secondJob = await manager.createJob();

    const firstRun = manager.runOptimization(firstJob.id, { config: { R2_KEY_PREFIX: "photos" } });

    await assert.rejects(
      () => manager.runOptimization(secondJob.id, { config: { R2_KEY_PREFIX: "photos" } }),
      /already running/,
    );

    release();
    await firstRun;
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("JobManager cleanup removes the job directory and in-memory record", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "r2bt-job-cleanup-"));

  try {
    const manager = new JobManager({ rootDir });
    const job = await manager.createJob();

    await writeFile(path.join(job.paths.output, "example.txt"), "temporary\n", "utf8");
    await manager.cleanupJob(job.id);

    assert.equal(manager.getJob(job.id), null);
    await assert.rejects(() => access(job.paths.root));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
