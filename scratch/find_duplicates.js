const en = require("./packages/dictionaries/en.json");

function findDuplicates(obj, seen = new Map(), path = "") {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (seen.has(key)) {
      console.log(`Duplicate key found: "${key}" at "${currentPath}" and "${seen.get(key)}"`);
    } else {
      seen.set(key, currentPath);
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      findDuplicates(value, seen, currentPath);
    }
  }
}

findDuplicates(en);
