module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 0,
    '@typescript-eslint/no-use-before-define': 0,
    "arrow-parens": [
      1,
      "always"
    ],
    "class-methods-use-this": 1,
    "func-names": 0,
    "function-paren-newline": 0,
    "no-plusplus": 0,
    "object-curly-newline": 0,
    "prefer-arrow-callback": 0,
  }
};
