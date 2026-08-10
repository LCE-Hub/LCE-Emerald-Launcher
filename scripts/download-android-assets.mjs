#!/usr/bin/env node
import {
  createWriteStream,
  createReadStream,
  existsSync,
  rename,
  unlinkSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
const RELEASE_TAG = "android-assets-v1";
const REPO = "LCE-Hub/LCE-Emerald-Launcher";
const ASSET_DIR = fileURLToPath(
  new URL("../src-tauri/gen/android/app/src/main/assets/", import.meta.url),
);

const ASSETS = [
  {
    file: "imagefs.tar.zst",
    sha256: "7838756e6a05c91afff68f4bf12aa2780f815877753f8dd354e203e99b9caf8a",
  },
  {
    file: "proton-11.0-arm64ec.tar.zst",
    sha256: "ceb768396c2d44256518f94ae236f0c1f40738cf050a52e990e2fef67ff161df",
  },
];

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  if (!res.body) {
    throw new Error(`no response body for ${url}`);
  }

  const fileStream = createWriteStream(dest);
  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(res.body);
    body.pipe(fileStream);
    body.on("error", reject);
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });
}

let failed = false;
for (const asset of ASSETS) {
  const target = path.join(ASSET_DIR, asset.file);
  if (existsSync(target)) {
    const actual = await sha256File(target);
    if (actual === asset.sha256) {
      console.log(`okay   ${asset.file} (up to date)`);
      continue;
    }

    console.error(
      `error ${asset.file}: sha256 mismatch (expected ${asset.sha256}, got ${actual}); delete it and rerun`,
    );

    failed = true;
    continue;
  }

  const url = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${asset.file}`;
  console.log(`get  ${asset.file} <- ${url}`);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = target + ".part";
  try {
    await download(url, tmp);
    const actual = await sha256File(tmp);
    if (actual !== asset.sha256) {
      console.error(
        `error ${asset.file}: downloaded sha256 mismatch (expected ${asset.sha256}, got ${actual})`,
      );

      failed = true;
      if (existsSync(tmp)) {
        unlinkSync(tmp);
      }

      continue;
    }

    await rename(tmp, target);
    console.log(`okay ${asset.file} (downloaded)`);
  } catch (error) {
    console.error(`error ${asset.file}: ${error.message}`);
    failed = true;
    if (existsSync(tmp)) {
      unlinkSync(tmp);
    }
  }
}

process.exit(failed ? 1 : 0);
