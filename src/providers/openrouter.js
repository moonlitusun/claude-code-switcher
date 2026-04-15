const https = require("https");

function detectProviderKind(baseUrl) {
  if (!baseUrl) return "anthropic";
  if (baseUrl.indexOf("openrouter.ai") >= 0) return "openrouter";
  return "custom";
}

function filterModelsByVendor(models, vendor) {
  const prefix = vendor ? vendor + "/" : "";
  return models
    .map((entry) => entry.id)
    .filter((id) => (vendor ? id.indexOf(prefix) === 0 : true))
    .sort();
}

function fetchOpenRouterModels() {
  return new Promise((resolve, reject) => {
    https
      .get("https://openrouter.ai/api/v1/models", (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error("OpenRouter API returned status " + res.statusCode));
            return;
          }

          try {
            const parsed = JSON.parse(body);
            resolve(parsed.data || []);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

module.exports = {
  detectProviderKind,
  filterModelsByVendor,
  fetchOpenRouterModels,
};
