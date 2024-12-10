vue vite(2.x.x-5.x.x版本)

```
npm install vite-plugin-node-polyfills --save-dev

vit.config.ts中：
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'assert', 'vm', 'process', 'util'],
    }),
  ],
});

```

react 

react-app-rewired

```
npm install assert buffer crypto-browserify stream-browserify vm-browserify process --save-dev
 
"scripts": {
    "start": "react-app-rewired start",
    "build": "react-app-rewired build",
    "test": "react-app-rewired test",
    "eject": "react-scripts eject"
},
  
config-overrides.js中：
const webpack = require('webpack');

module.exports = function override(config, env) {
    config.resolve.fallback = {
        ...config.resolve.fallback,
        "crypto": require.resolve('crypto-browserify'),
        "stream": require.resolve('stream-browserify'),
        "assert": require.resolve('assert/'),
        "buffer": require.resolve('buffer/'),
        "process": require.resolve('process/browser'),
        "vm": require.resolve('vm-browserify'),
    };
    config.plugins.push(
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
            process: 'process/browser',
        })
    );
    return config;
};
  
  
```

craro

```
npm install assert buffer crypto-browserify stream-browserify vm-browserify process --save-dev

 "scripts": {
    "start": "craco start",
    "build": "craco build",
    "test": "craco test",
    "eject": "react-scripts eject"
  },

craco.config.js中：
module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            webpackConfig.resolve.fallback = {
                ...webpackConfig.resolve.fallback,
                buffer: require.resolve('buffer/'),
                assert: require.resolve('assert/'),
                crypto: require.resolve('crypto-browserify'),
                stream: require.resolve('stream-browserify'),
                vm: require.resolve('vm-browserify'),
                process: require.resolve('process/browser.js'),
            };
            const webpack = require('webpack');
            webpackConfig.plugins.push(
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer'],
                    process: 'process/browser.js',
                })
            );
            return webpackConfig;
        },
    },
};

```

