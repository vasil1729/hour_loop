module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],
  testPathIgnorePatterns: ['<rootDir>/.apk-build/', '<rootDir>/node_modules/'],
  modulePathIgnorePatterns: ['<rootDir>/.apk-build/'],
  watchPathIgnorePatterns: ['<rootDir>/.apk-build/'],
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    'src/features/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
  ],
};
