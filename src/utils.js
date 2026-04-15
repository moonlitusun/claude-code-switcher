const fs = require("fs");
const path = require("path");
const os = require("os");

function getClaudeDir(customDir) {
  return customDir || path.join(os.homedir(), ".claude");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function stableStringify(value) {
  function sortDeep(input) {
    if (Array.isArray(input)) {
      return input.map(sortDeep);
    }

    if (input && typeof input === "object") {
      return Object.keys(input)
        .sort()
        .reduce((acc, key) => {
          acc[key] = sortDeep(input[key]);
          return acc;
        }, {});
    }

    return input;
  }

  return JSON.stringify(sortDeep(value));
}

module.exports = {
  getClaudeDir,
  readJson,
  writeJson,
  stableStringify,
};
