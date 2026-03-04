import fs from "fs";
import path from "path";

const modulesDir = "./packages/modules/src";
const actionsMap = {};

function grepActions(dir) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      grepActions(full);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      const content = fs.readFileSync(full, "utf8");
      const matches = content.matchAll(
        /export (?:const|function|async function|let) ([a-zA-Z0-9_]+)/g,
      );
      for (const match of matches) {
        let importPath =
          "@workspace/modules/" +
          path
            .relative(modulesDir, full)
            .replace(".ts", "")
            .replace(/\\/g, "/");
        actionsMap[match[1]] = importPath;
      }
    }
  }
}
grepActions(modulesDir);
actionsMap["axiosInstance"] = "@workspace/modules/client";
actionsMap["checkRole"] = "@workspace/modules/auth/auth.action";
actionsMap["sync_user"] = "@workspace/modules/user/user.action";
actionsMap["get_me"] = "@workspace/modules/user/user.action";

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      processDir(full);
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      let content = fs.readFileSync(full, "utf8");
      let changed = false;

      content = content.replace(
        /import\s+\{([^}]+)\}\s+from\s+["']@workspace\/modules(?:\/client)?["'];?/g,
        (match, importsStr) => {
          changed = true;
          const imports = importsStr
            .replace(/\n/g, " ")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const byPath = {};

          for (const imp of imports) {
            let name = imp;
            if (imp.includes(" as ")) {
              const parts = imp.split(" as ").map((s) => s.trim());
              name = parts[0];
            }

            let importPath = actionsMap[name];
            if (!importPath) importPath = "@workspace/modules/client";

            if (!byPath[importPath]) byPath[importPath] = [];
            byPath[importPath].push(imp);
          }

          return Object.entries(byPath)
            .map(
              ([p, imps]) =>
                "import { " + imps.join(", ") + ' } from "' + p + '";',
            )
            .join("\n");
        },
      );

      if (changed) {
        fs.writeFileSync(full, content);
        console.log(`Updated ${full}`);
      }
    }
  }
}

console.log("Processing apps/admin...");
processDir("./apps/admin/app");
processDir("./apps/admin/components");
console.log("Success!");
