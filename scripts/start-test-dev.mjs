import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const testEnvironment = parseEnv(readFileSync(".env.test.local", "utf8"));
const nextBin = "node_modules/next/dist/bin/next";

const child = spawn(process.execPath, [nextBin, "dev"], {
  env: { ...process.env, ...testEnvironment },
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
