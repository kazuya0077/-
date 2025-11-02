const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const filesToCopy = [
  'index.html',
  'styles.css',
  'script.js',
  'config.js',
  'config.sample.js',
  'google_apps_script.gs',
  'README.md'
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const file of filesToCopy) {
  const sourcePath = path.join(projectRoot, file);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`⚠️  Skipping missing file: ${file}`);
    continue;
  }

  const destPath = path.join(distDir, file);
  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
  console.log(`📦 Copied ${file}`);
}

console.log(`✅ Static assets exported to ${distDir}`);
