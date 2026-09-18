import { spawn } from "node:child_process";

const child = spawn("npx", ["tsx", "server/index.ts"], {
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT || "3000" },
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code || 0));
