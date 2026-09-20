import { spawn } from "node:child_process";
import process from "node:process";

const forwarded = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--host") {
    forwarded.push("--hostname");
    continue;
  }
  if (argument === "--strictPort") continue;
  forwarded.push(argument);
}

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", ...forwarded],
  { stdio: "inherit", env: process.env },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
