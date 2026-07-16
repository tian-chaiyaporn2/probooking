export default {
  default: {
    // NOTE: support code is loaded via CLI --import in the package.json test:bdd
    // script (cucumber's config `import` is not reliably honored under ESM + tsx).
    paths: ["features/**/*.feature"],
    format: ["summary", "progress-bar"],
  },
};
