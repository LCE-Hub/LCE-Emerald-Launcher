import { spawnSync } from "node:child_process";
import { existsSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const GOLDMAPPER_DIR = path.join(ROOT_DIR, "GoldMapper");
const BUILD_DIR = path.join(GOLDMAPPER_DIR, "build");
const RESOURCES_DIR = path.join(ROOT_DIR, "src-tauri", "resources");
const TOOLCHAIN_MINGW = path.join(SCRIPT_DIR, "toolchain-mingw.cmake");
const IS_WINDOWS = process.platform === "win32";
function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: IS_WINDOWS,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (
  !existsSync(
    path.join(GOLDMAPPER_DIR, "third_party", "minhook", "include", "MinHook.h"),
  )
) {
  console.log("Initializing minhook submodule...");
  run(
    "git",
    ["-C", GOLDMAPPER_DIR, "submodule", "update", "--init", "--recursive"],
    ROOT_DIR,
  );
}

console.log("Configuring GoldMapper...");
const configureArgs = ["-B", BUILD_DIR, "-DCMAKE_BUILD_TYPE=Release"];
if (!IS_WINDOWS) {
  configureArgs.push("-DCMAKE_TOOLCHAIN_FILE=" + TOOLCHAIN_MINGW);
}
configureArgs.push(GOLDMAPPER_DIR);
run("cmake", configureArgs, ROOT_DIR);
console.log("Building GoldMapper...");
run("cmake", ["--build", BUILD_DIR, "--config", "Release"], ROOT_DIR);
console.log("Copying binaries to resources...");
mkdirSync(RESOURCES_DIR, { recursive: true });
const outputs = [
  {
    source: "GoldMapperLib.dll",
    names: ["GoldMapperLib.dll", "libGoldMapperLib.dll"], //neo: dont ask me vro idk why it does that
  },
  { source: "GoldMapperLauncher.exe", names: ["GoldMapperLauncher.exe"] },
];

for (const entry of outputs) {
  const dir = entry.dir ?? BUILD_DIR;
  const file = path.join(dir, entry.source);
  if (existsSync(file)) {
    copyFileSync(file, path.join(RESOURCES_DIR, entry.source));
    continue;
  }
  const candidate = readdirSync(dir).find((f) =>
    entry.names.some((n) => f.toLowerCase() === n.toLowerCase()),
  );
  if (!candidate) {
    console.error(`Missing build output: ${entry.source}`);
    process.exit(1);
  }
  copyFileSync(
    path.join(dir, candidate),
    path.join(RESOURCES_DIR, entry.source),
  );
}

console.log("GoldMapper build complete.");
