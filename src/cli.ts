#!/usr/bin/env node

const subcommand = process.argv[2];

if (subcommand === "setup") {
  await import("./setup.js");
} else {
  await import("./server.js");
}
