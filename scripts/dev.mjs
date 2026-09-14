import { spawn } from "node:child_process";

const vite = spawn("pnpm", ["vite", "--host"], { stdio: "inherit", env: process.env });
const api = spawn("pnpm", ["tsx", "server/index.ts"], { stdio: "inherit", env: { ...process.env, PORT: "3001", NODE_ENV: "development" } });

const stop = () => { vite.kill("SIGTERM"); api.kill("SIGTERM"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", (code) => { if (code && code !== 130) api.kill("SIGTERM"); });
api.on("exit", (code) => { if (code && code !== 130) vite.kill("SIGTERM"); });
