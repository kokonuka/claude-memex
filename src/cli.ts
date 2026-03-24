#!/usr/bin/env node

const subcommand = process.argv[2];

if (subcommand === "setup") {
  await import("./setup.js");
} else if (subcommand === "viewer") {
  await import("./viewer.js");
} else {
  await import("./server.js");
}
