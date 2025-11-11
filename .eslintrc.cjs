module.exports = {
  env: {
    node: true,
    es2021: true
  },
  globals: {
    __dirname: "readonly"
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest"
  }
};
