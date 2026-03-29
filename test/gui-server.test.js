import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import sharp from "sharp";

import { createGuiServer } from "../src/gui/server.js";

test("GUI server completes config, optimize, and upload flow", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "r2bt-server-"));
  const app = createGuiServer({
    cwd,
    port: 4317,
    jobManager: undefined,
  });

  app.jobManager.uploadManifestItemsFn = async ({ manifest, env }) => ({
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
  });

  try {
    const { url } = await app.start();
    const pageResponse = await fetch(url);
    const pageText = await pageResponse.text();

    assert.equal(pageResponse.status, 200);
    assert.match(pageText, /R2 Bucket Tool/);

    const configResponse = await fetch(`${url}/api/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        R2_ACCOUNT_ID: "account-id",
        R2_BUCKET: "bucket-name",
        R2_PUBLIC_BASE_URL: "https://img.example.com",
        R2_ACCESS_KEY_ID: "access-id",
        R2_SECRET_ACCESS_KEY: "secret-key",
      }),
    });
    const configPayload = await configResponse.json();

    assert.equal(configPayload.secrets.R2_SECRET_ACCESS_KEY.configured, true);
    assert.equal(configPayload.values.R2_BUCKET, "bucket-name");

    const photo = await sharp({
      create: {
        width: 1600,
        height: 1000,
        channels: 3,
        background: { r: 220, g: 190, b: 160 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    const png = await sharp({
      create: {
        width: 640,
        height: 320,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const form = new FormData();

    form.append("photoFormat", "webp");
    form.append("photoQuality", "52");
    form.append("file:gallery%2Fhero.jpg", new File([photo], "hero.jpg", { type: "image/jpeg" }), "hero.jpg");
    form.append("file:gallery%2Flogo.png", new File([png], "logo.png", { type: "image/png" }), "logo.png");

    const createJobResponse = await fetch(`${url}/api/jobs`, {
      method: "POST",
      body: form,
    });
    const createJobPayload = await createJobResponse.json();

    assert.equal(createJobResponse.status, 202);

    const readyJob = await waitForJob(url, createJobPayload.jobId, "ready");

    assert.equal(readyJob.items.length, 2);
    assert.equal(readyJob.defaults.photoFormat, "webp");
    assert.equal(readyJob.defaults.photoQuality, 52);
    assert.equal(readyJob.items.some((item) => item.format === "webp"), true);
    assert.equal(readyJob.items[0].delivery.sourceUrl.startsWith("https://img.example.com/"), true);

    const archiveResponse = await fetch(`${url}${readyJob.exports.optimizedArchive}`);
    const archiveBuffer = Buffer.from(await archiveResponse.arrayBuffer());

    assert.equal(archiveResponse.status, 200);
    assert.equal(archiveResponse.headers.get("content-type"), "application/zip");
    assert.equal(archiveBuffer.length > 0, true);

    const uploadResponse = await fetch(`${url}/api/jobs/${createJobPayload.jobId}/upload`, {
      method: "POST",
    });
    const uploadPayload = await uploadResponse.json();

    assert.equal(uploadPayload.phase, "uploading");

    const uploadedJob = await waitForJob(url, createJobPayload.jobId, "uploaded");

    assert.equal(uploadedJob.items[0].delivery.uploaded, true);

    const exportResponse = await fetch(`${url}${uploadedJob.exports.manifest}`);
    const manifestText = await exportResponse.text();

    assert.match(manifestText, /"summary"/);
  } finally {
    await app.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("GUI server blocks upload when required R2 config is missing", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "r2bt-server-missing-"));
  const app = createGuiServer({
    cwd,
    port: 4318,
  });

  try {
    const { url } = await app.start();
    const job = await app.jobManager.createJob();
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      inputDir: job.paths.input,
      outputDir: job.paths.output,
      defaults: {},
      summary: { totalFiles: 1, totalOriginalBytes: 1, totalOptimizedBytes: 1, totalSavedBytes: 0, totalSavingsRatio: 0 },
      items: [],
    };

    job.manifest = manifest;

    const response = await fetch(`${url}/api/jobs/${job.id}/upload`, {
      method: "POST",
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Missing required R2 configuration/);
    assert.equal(payload.missingFields.includes("R2_BUCKET"), true);
  } finally {
    await app.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("GUI server cleans up a completed job and stops serving it", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "r2bt-server-cleanup-"));
  const app = createGuiServer({
    cwd,
    port: 4319,
  });

  try {
    const { url } = await app.start();
    const job = await app.jobManager.createJob();
    job.manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      inputDir: job.paths.input,
      outputDir: job.paths.output,
      defaults: {},
      summary: { totalFiles: 1, totalOriginalBytes: 1, totalOptimizedBytes: 1, totalSavedBytes: 0, totalSavingsRatio: 0 },
      items: [],
    };
    job.status = "ready";

    const cleanupResponse = await fetch(`${url}/api/jobs/${job.id}/cleanup`, {
      method: "POST",
    });
    const cleanupPayload = await cleanupResponse.json();

    assert.equal(cleanupResponse.status, 200);
    assert.equal(cleanupPayload.cleaned, true);

    const missingResponse = await fetch(`${url}/api/jobs/${job.id}`);
    const missingPayload = await missingResponse.json();

    assert.equal(missingResponse.status, 404);
    assert.match(missingPayload.error, /Job not found/);
  } finally {
    await app.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

async function waitForJob(baseUrl, jobId, targetStatus) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`);
    const payload = await response.json();

    if (payload.status === targetStatus) {
      return payload;
    }

    if (payload.status === "error") {
      throw new Error(payload.error || "Job failed during polling.");
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for job status ${targetStatus}.`);
}
