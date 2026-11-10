module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    'src/features/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
  ],
};
