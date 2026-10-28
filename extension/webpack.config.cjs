const path = require('node:path');
module.exports = (_, argv) => ({
  mode: argv.mode || 'production', entry: './src/index.tsx',
  output: {path: path.resolve(__dirname, 'dist/resources'), filename: 'extension-karpenter-manager.js', clean: true},
  resolve: {extensions: ['.tsx', '.ts', '.js']},
  module: {rules: [{test: /\.tsx?$/, exclude: /node_modules/, use: {loader: 'ts-loader', options: {transpileOnly: true}}},{test: /\.css$/, use: ['style-loader','css-loader']},{test: /\.md$/, type: 'asset/source'}]},
  externals: {'react':'React','react-dom':'ReactDOM','react/jsx-runtime':'ReactJSXRuntime'},
  optimization: {splitChunks: false, runtimeChunk: false},
});
