#!/usr/bin/env node
"use strict";

// Package dist/chrome with the version read from package.json, so every
// release bump produces the correct artifact name without manual edits.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const srcDir = path.join(ROOT, "dist", "chrome");

if (!fs.existsSync(srcDir)) {
  console.error(`Missing ${srcDir}. Run "npm run build:chrome" first.`);
  process.exit(1);
}

const outDir = path.join(ROOT, "web-ext-artifacts");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `bang_search-chrome-${pkg.version}.zip`);

const command =
  `Compress-Archive -Force -Path '${path.join(srcDir, "*")}' ` +
  `-DestinationPath '${outFile}'`;

execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
  stdio: "inherit",
});

console.log(`Chrome zip -> ${outFile}`);
