#!/usr/bin/env node
import { webcrypto } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import esbuild from "esbuild";

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
  globalThis.crypto = webcrypto;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    cwd: projectRoot,
    shell: process.platform === "win32",
    ...options,
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function buildClient() {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  const viteBin = path.resolve(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );
  await run(viteBin, ["build"]);
}

async function buildServer() {
  console.log("Bundling server code with esbuild API...");
  await esbuild.build({
    entryPoints: ["server/index.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    tsconfig: "tsconfig.json",
    outfile: "dist/index.js",
    external: ["./vite.js"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
  console.log("Server bundling completed.");
}

async function main() {
  try {
    await buildClient();
    await buildServer();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

await main();
