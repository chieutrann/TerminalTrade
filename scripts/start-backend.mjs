import { spawn } from "node:child_process";

const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || process.env.BACKEND_PORT || "8080";
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const args = [
  "-m",
  "uvicorn",
  "app.main:app",
  "--app-dir",
  "backend",
  "--host",
  host,
  "--port",
  port,
  "--proxy-headers",
];

const child = spawn(python, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(`Failed to start backend with ${python}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
