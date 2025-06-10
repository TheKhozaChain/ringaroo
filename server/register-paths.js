const { register } = require('tsconfig-paths');
const { resolve } = require('path');

// Register path mappings for production builds
register({
  baseUrl: resolve(__dirname, 'dist'),
  paths: {
    '@/*': ['*'],
    '@/types/*': ['types/*'],
    '@/utils/*': ['utils/*'],
    '@/services/*': ['services/*'],
    '@/routes/*': ['routes/*'],
    '@/config': ['config/index.js'],
    '@/config/*': ['config/*']
  }
});