const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web implementation loads its SQLite engine from a .wasm file.
config.resolver.assetExts.push('wasm');

module.exports = config;
