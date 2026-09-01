#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_COMMON = path.join(ROOT, "src", "common");
const SRC_FIREFOX = path.join(ROOT, "src", "firefox");
const SRC_CHROME = path.join(ROOT, "src", "chrome");

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function buildTarget(target) {
  const srcPlatform = target === "firefox" ? SRC_FIREFOX : SRC_CHROME;
  const outDir = path.join(ROOT, "dist", target);
  if (!fs.existsSync(SRC_COMMON)) { console.error(`Missing ${SRC_COMMON}`); process.exit(1); }
  if (!fs.existsSync(srcPlatform)) { console.error(`Missing ${srcPlatform}`); process.exit(1); }
  cleanDir(outDir);
  copyRecursive(SRC_COMMON, outDir);
  for (const entry of fs.readdirSync(srcPlatform)) {
    copyRecursive(path.join(srcPlatform, entry), path.join(outDir, entry));
  }
  console.log(`Built dist/${target} -> ${outDir}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));
  console.log(`  manifest version ${manifest.version} (${target})`);
}

const target = process.argv[2];
if (target === "firefox" || target === "chrome") buildTarget(target);
else if (target === "all" || !target) { buildTarget("firefox"); buildTarget("chrome"); }
else { console.error(`Unknown target: ${target}. Use firefox|chrome|all`); process.exit(1); }
