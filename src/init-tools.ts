import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { detect } from "@antfu/ni";
import { execa } from "execa";
import ora from "ora";
import { type PackageJson } from "type-fest";

import { getConfig } from "./config";

const STD_PACKAGES = {
  dependencies: ["zod", "query-string"],
  devDependencies: ["@asteasolutions/zod-to-openapi"],
};
const STD_SCRIPTS = {
  "ntstr:buid": "npx next-tsr build",
  "ntstr:buid:watch": "npx next-tsr build --watch",
};
const OPENAPI_PACKAGES = {
  dependencies: [],
  devDependencies: ["@asteasolutions/zod-to-openapi"],
};
const OPENAPI_SCRIPTS = {
  openapi: "npm run openapi:yaml && npm run openapi:html",
  "openapi:yaml": "ts-node ./src/routes/openapi.ts",
  "openapi:html": "npx @redocly/cli build-docs openapi-docs.yml",
};

export function getPackageInfo() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const packageJsonPath = path.resolve(__dirname, "../package.json");
  return fs.readJSONSync(packageJsonPath) as PackageJson;
}

export function addPackageJSONScripts(scripts: Record<string, string>) {
  const packageJsonPath = path.resolve("./package.json");
  const packageJson = fs.readJSONSync(packageJsonPath) as PackageJson;

  const newPackageJson = {
    ...packageJson,
    scripts: {
      ...packageJson.scripts,
    },
  };
  for (const key of Object.keys(scripts)) {
    if (!newPackageJson.scripts[key]) {
      newPackageJson.scripts[key] = scripts[key];
    }
  }

  return fs.writeJSONSync(packageJsonPath, newPackageJson, {
    spaces: 2,
    EOL: "\n",
  });
}

async function getPackageManager(): Promise<"yarn" | "pnpm" | "bun" | "npm"> {
  const packageManager = await detect({
    programmatic: true,
    cwd: process.cwd(),
  });

  if (packageManager === "yarn@berry") return "yarn";
  if (packageManager === "pnpm@6") return "pnpm";
  if (packageManager === "bun") return "bun";

  return packageManager ?? "npm";
}

export async function copyAssets() {
  const config = getConfig();
  const openapi = !!config.openapi;

  const spinner = ora(`Installing components...`).start();

  const { routes } = getConfig();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  fs.mkdirpSync(routes);
  fs.copyFileSync(
    path.resolve(__dirname, "../assets/makeRoute.tsx"),
    path.resolve(routes, "./makeRoute.tsx")
  );

  spinner.text = "Getting package maanger.";

  const pkgMgr = await getPackageManager();

  spinner.text = "Installing dependencies.";

  const packages = [
    ...STD_PACKAGES.dependencies,
    ...(openapi ? OPENAPI_PACKAGES.dependencies : []),
  ];
  if (packages?.length) {
    await execa(pkgMgr, [pkgMgr === "npm" ? "install" : "add", ...packages]);
  }

  spinner.text = "Installing dev dependencies.";

  const devPackages = [
    ...STD_PACKAGES.devDependencies,
    ...(openapi ? OPENAPI_PACKAGES.devDependencies : []),
  ];
  if (devPackages?.length) {
    await execa(pkgMgr, [
      pkgMgr === "npm" ? "install" : "add",
      "-D",
      ...devPackages,
    ]);
  }

  spinner.text = "Adding package.json scripts.";

  const scripts = {
    ...STD_SCRIPTS,
    ...(openapi ? OPENAPI_SCRIPTS : {}),
  };
  addPackageJSONScripts(scripts);

  spinner.succeed(`Done.`);
}
