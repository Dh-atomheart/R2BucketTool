import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_JPEG_QUALITY, DEFAULT_MAX_LONG_EDGE } from "../lib/constants.js";
import { optimizeDirectory } from "../lib/optimizer.js";
import { uploadManifestItems } from "../lib/r2.js";
import { buildDeliveryBundle } from "./delivery.js";

export class JobManager {
  constructor({
    rootDir = path.resolve(process.cwd(), ".tmp/gui-jobs"),
    optimizeDirectoryFn = optimizeDirectory,
    uploadManifestItemsFn = uploadManifestItems,
  } = {}) {
    this.rootDir = rootDir;
    this.optimizeDirectoryFn = optimizeDirectoryFn;
    this.uploadManifestItemsFn = uploadManifestItemsFn;
    this.jobs = new Map();
    this.optimizeBusy = false;
    this.uploadBusy = false;
  }

  async createJob() {
    const jobId = randomUUID();
    const jobRoot = path.join(this.rootDir, jobId);
    const job = {
      id: jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "idle",
      phase: null,
      error: null,
      manifest: null,
      uploadedManifest: null,
      paths: {
        root: jobRoot,
        input: path.join(jobRoot, "input"),
        output: path.join(jobRoot, "output"),
        manifest: path.join(jobRoot, "manifest.json"),
        uploadedManifest: path.join(jobRoot, "uploaded-manifest.json"),
      },
    };

    await mkdir(job.paths.input, { recursive: true });
    await mkdir(job.paths.output, { recursive: true });
    this.jobs.set(jobId, job);

    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async runOptimization(jobId, { config, options = {} }) {
    const job = this.requireJob(jobId);

    if (this.optimizeBusy) {
      throw createBusyError("An optimization job is already running.");
    }

    this.optimizeBusy = true;
    this.updateJob(job, {
      status: "processing",
      phase: "optimizing",
      error: null,
    });

    try {
      const manifest = await this.optimizeDirectoryFn({
        inputDir: job.paths.input,
        outputDir: job.paths.output,
        keyPrefix: config.R2_KEY_PREFIX || "photos",
        maxLongEdge: DEFAULT_MAX_LONG_EDGE,
        jpegQuality: DEFAULT_JPEG_QUALITY,
        photoFormat: options.photoFormat,
        photoQuality: options.photoQuality,
      });

      if ((manifest.items || []).length === 0) {
        throw new Error("No supported image files were found in the selected folder.");
      }

      job.manifest = manifest;
      await writeFile(job.paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      this.updateJob(job, {
        status: "ready",
        phase: null,
      });

      return this.serializeJob(job, { config });
    } catch (error) {
      this.updateJob(job, {
        status: "error",
        phase: null,
        error: error.message,
      });
      throw error;
    } finally {
      this.optimizeBusy = false;
    }
  }

  async runUpload(jobId, { config, concurrency = 4 }) {
    const job = this.requireJob(jobId);

    if (this.uploadBusy) {
      throw createBusyError("An upload job is already running.");
    }

    if (!job.manifest) {
      throw new Error("This job has not completed optimization yet.");
    }

    this.uploadBusy = true;
    this.updateJob(job, {
      status: "processing",
      phase: "uploading",
      error: null,
    });

    try {
      const uploadedManifest = await this.uploadManifestItemsFn({
        manifest: job.manifest,
        outputRoot: job.manifest.outputDir || job.paths.output,
        concurrency,
        env: config,
      });

      job.uploadedManifest = uploadedManifest;
      await writeFile(job.paths.uploadedManifest, `${JSON.stringify(uploadedManifest, null, 2)}\n`, "utf8");
      this.updateJob(job, {
        status: "uploaded",
        phase: null,
      });

      return this.serializeJob(job, { config });
    } catch (error) {
      this.updateJob(job, {
        status: "error",
        phase: null,
        error: error.message,
      });
      throw error;
    } finally {
      this.uploadBusy = false;
    }
  }

  async hasExport(jobId, type) {
    const job = this.requireJob(jobId);
    const exportPath = type === "uploaded" ? job.paths.uploadedManifest : job.paths.manifest;

    try {
      await access(exportPath);
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }

  async cleanupJob(jobId) {
    const job = this.requireJob(jobId);

    if (job.status === "processing") {
      throw createBusyError("This job is still running and cannot be cleaned up yet.");
    }

    await rm(job.paths.root, { recursive: true, force: true });
    this.jobs.delete(jobId);

    return {
      id: jobId,
      cleaned: true,
    };
  }

  serializeJob(jobOrId, { config } = {}) {
    const job = typeof jobOrId === "string" ? this.requireJob(jobOrId) : jobOrId;
    const manifest = job.uploadedManifest || job.manifest;
    const baseUrl = config?.R2_PUBLIC_BASE_URL || "";
    const items = (manifest?.items || []).map((item) => serializeItem(job, item, baseUrl));

    return {
      id: job.id,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      status: job.status,
      phase: job.phase,
      error: job.error,
      summary: manifest?.summary || null,
      defaults: manifest?.defaults || null,
      upload: {
        uploadedAt: job.uploadedManifest?.uploadedAt || null,
        dryRun: Boolean(job.uploadedManifest?.dryRun),
      },
      exports: {
        manifest: `/api/jobs/${job.id}/export?type=manifest`,
        uploadedManifest: job.uploadedManifest ? `/api/jobs/${job.id}/export?type=uploaded` : null,
        optimizedArchive: job.manifest ? `/api/jobs/${job.id}/download?type=optimized` : null,
      },
      items,
    };
  }

  requireJob(jobId) {
    const job = this.getJob(jobId);

    if (!job) {
      const error = new Error(`Job not found: ${jobId}`);
      error.code = "JOB_NOT_FOUND";
      throw error;
    }

    return job;
  }

  updateJob(job, patch) {
    Object.assign(job, patch, {
      updatedAt: new Date().toISOString(),
    });
  }
}

function serializeItem(job, item, baseUrl) {
  return {
    ...item,
    previews: {
      source: `/api/jobs/${job.id}/files/input/${encodePath(item.sourceRelativePath)}`,
      optimized: `/api/jobs/${job.id}/files/output/${encodePath(item.key)}`,
    },
    delivery: buildDeliveryBundle({
      baseUrl,
      key: item.key,
      width: item.width,
      height: item.height,
      uploaded: Boolean(item.uploaded),
    }),
  };
}

function createBusyError(message) {
  const error = new Error(message);
  error.code = "JOB_BUSY";

  return error;
}

function encodePath(value) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
