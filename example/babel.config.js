const path = require('path');
const { getConfig } = require('react-native-builder-bob/babel-config');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

module.exports = getConfig(
  {
    presets: ['module:@react-native/babel-preset'],
    // Required for VisionCamera v5 frame processors / worklets. Must be last.
    plugins: ['react-native-worklets/plugin'],
  },
  { root, pkg }
);
