module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  // `mrz` ships as ESM, so it must be transformed instead of ignored.
  transformIgnorePatterns: ['node_modules/(?!(mrz)/)'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
};
