/**
 * Webpack configuration for tree-shaking analysis
 * Use this to verify tree-shaking effectiveness
 */

const path = require('path');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
  mode: 'production',
  
  // Multiple entry points to test different imports
  entry: {
    'core-only': './examples/tree-shaking/core-only.ts',
    'scaleway-only': './examples/tree-shaking/scaleway-only.ts',
    'validation-only': './examples/tree-shaking/validation-only.ts',
    'errors-only': './examples/tree-shaking/errors-only.ts',
    'full-bundle': './examples/tree-shaking/full-bundle.ts'
  },
  
  output: {
    path: path.resolve(__dirname, '..', 'dist-analysis'),
    filename: '[name].bundle.js',
    clean: true
  },
  
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'cloudypad/core': path.resolve(__dirname, '..', 'src/core/index.ts'),
      'cloudypad/validation': path.resolve(__dirname, '..', 'src/validation/index.ts'),
      'cloudypad/errors': path.resolve(__dirname, '..', 'src/errors/index.ts'),
      'cloudypad/providers/scaleway': path.resolve(__dirname, '..', 'src/providers/scaleway/index.ts'),
      'cloudypad/providers/aws': path.resolve(__dirname, '..', 'src/providers/aws/index.ts'),
      'cloudypad/providers/azure': path.resolve(__dirname, '..', 'src/providers/azure/index.ts'),
      'cloudypad/providers/gcp': path.resolve(__dirname, '..', 'src/providers/gcp/index.ts'),
      'cloudypad': path.resolve(__dirname, '..', 'src/index.ts')
    }
  },
  
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  
  optimization: {
    usedExports: true,
    sideEffects: false,
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  },
  
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: 'bundle-analysis.html'
    })
  ],
  
  stats: {
    modules: true,
    usedExports: true,
    providedExports: true,
    optimizationBailout: true
  }
};