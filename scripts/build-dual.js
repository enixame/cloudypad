#!/usr/bin/env node
/**
 * Dual ESM/CJS build script
 * Generates optimized bundles for tree-shaking
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = 'dist';

/**
 * Clean and create dist directory
 */
function cleanAndCreateDist() {
  console.log('🧹 Cleaning dist directory...');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

/**
 * Build TypeScript to CommonJS
 */
function buildCJS() {
  console.log('📦 Building CommonJS...');
  execSync('tsc -p tsconfig.build.json --module commonjs --outDir dist', { 
    stdio: 'inherit' 
  });
}

/**
 * Build TypeScript to ESM
 */
function buildESM() {
  console.log('📦 Building ESM...');
  
  // Create ESM-specific tsconfig
  const esmTsConfig = {
    extends: './tsconfig.build.json',
    compilerOptions: {
      module: 'es2022',
      moduleResolution: 'node',
      target: 'es2020',
      outDir: 'dist-esm'
    }
  };
  
  fs.writeFileSync('tsconfig.esm.json', JSON.stringify(esmTsConfig, null, 2));
  
  try {
    execSync('tsc -p tsconfig.esm.json', { stdio: 'inherit' });
    
    // Rename JS files to MJS
    renameJsToMjs('dist-esm');
    
    // Move ESM files to dist with .mjs extension
    copyESMFiles('dist-esm', DIST_DIR);
    
    // Clean up temp directory
    fs.rmSync('dist-esm', { recursive: true, force: true });
    
  } finally {
    // Clean up temp tsconfig
    if (fs.existsSync('tsconfig.esm.json')) {
      fs.unlinkSync('tsconfig.esm.json');
    }
  }
}

/**
 * Recursively rename .js files to .mjs
 */
function renameJsToMjs(dir) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      renameJsToMjs(fullPath);
    } else if (item.endsWith('.js')) {
      const mjsPath = fullPath.replace('.js', '.mjs');
      fs.renameSync(fullPath, mjsPath);
    }
  }
}

/**
 * Copy ESM files to dist directory
 */
function copyESMFiles(sourceDir, targetDir) {
  const items = fs.readdirSync(sourceDir);
  
  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const targetPath = path.join(targetDir, item);
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      copyESMFiles(sourcePath, targetPath);
    } else if (item.endsWith('.mjs')) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * Generate package.json files for submodules
 */
function generateSubmodulePackages() {
  console.log('📝 Generating submodule package.json files...');
  
  const submodules = [
    'core',
    'validation', 
    'errors',
    'providers/scaleway',
    'providers/aws',
    'providers/azure',
    'providers/gcp'
  ];
  
  for (const submodule of submodules) {
    const submoduleDir = path.join(DIST_DIR, submodule);
    if (fs.existsSync(submoduleDir)) {
      const packageJson = {
        type: 'commonjs',
        main: './index.js',
        module: './index.mjs',
        types: './index.d.ts',
        sideEffects: false
      };
      
      fs.writeFileSync(
        path.join(submoduleDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
    }
  }
}

/**
 * Copy static assets
 */
function copyAssets() {
  console.log('📁 Copying assets...');
  
  // Copy ansible directory
  if (fs.existsSync('ansible')) {
    execSync(`cp -r ansible ${DIST_DIR}/ansible`, { stdio: 'inherit' });
  }
  
  // Copy package.json
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // Update paths for distribution
  packageJson.main = './index.js';
  packageJson.module = './index.mjs';
  packageJson.types = './index.d.ts';
  packageJson.bin = { cloudypad: './cli/main.js' };
  
  fs.writeFileSync(
    path.join(DIST_DIR, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Copy other files
  const filesToCopy = ['README.md', 'LICENSE.txt', 'CHANGELOG.md'];
  for (const file of filesToCopy) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(DIST_DIR, file));
    }
  }
}

/**
 * Generate import maps for tree-shaking examples
 */
function generateImportMaps() {
  console.log('🗺️  Generating import maps...');
  
  const importMap = {
    imports: {
      'cloudypad': './index.mjs',
      'cloudypad/core': './core/index.mjs',
      'cloudypad/validation': './validation/index.mjs',
      'cloudypad/errors': './errors/index.mjs',
      'cloudypad/providers/scaleway': './providers/scaleway/index.mjs',
      'cloudypad/providers/aws': './providers/aws/index.mjs',
      'cloudypad/providers/azure': './providers/azure/index.mjs',
      'cloudypad/providers/gcp': './providers/gcp/index.mjs'
    }
  };
  
  fs.writeFileSync(
    path.join(DIST_DIR, 'import-map.json'),
    JSON.stringify(importMap, null, 2)
  );
}

/**
 * Main build process
 */
async function main() {
  console.log('🚀 Starting dual ESM/CJS build...\n');
  
  try {
    cleanAndCreateDist();
    buildCJS();
    buildESM();
    generateSubmodulePackages();
    copyAssets();
    generateImportMaps();
    
    console.log('\n✅ Build completed successfully!');
    console.log(`📊 Bundle analysis:`);
    console.log(`   - CommonJS: ${DIST_DIR}/**/*.js`);
    console.log(`   - ESM: ${DIST_DIR}/**/*.mjs`);  
    console.log(`   - Types: ${DIST_DIR}/**/*.d.ts`);
    console.log(`   - Tree-shaking: enabled via sideEffects: false`);
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}