const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const backendMediaDir = path.join(rootDir, 'backend', 'public', 'media');
const imagesSource = path.join(rootDir, 'images');
const videosSource = path.join(rootDir, 'videos');

const imagesDest = path.join(backendMediaDir, 'images');
const videosDest = path.join(backendMediaDir, 'videos');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

function moveFiles(source, dest) {
    if (!fs.existsSync(source)) {
        console.warn(`Source directory not found: ${source}`);
        return;
    }
    
    ensureDir(dest);
    
    const files = fs.readdirSync(source);
    files.forEach(file => {
        const oldPath = path.join(source, file);
        const newPath = path.join(dest, file);
        try {
            fs.renameSync(oldPath, newPath);
            console.log(`Moved: ${file}`);
        } catch (err) {
            console.error(`Error moving ${file}:`, err);
        }
    });
    
    // Optional: remove empty source dir
    try {
        fs.rmdirSync(source);
        console.log(`Removed empty source: ${source}`);
    } catch (err) {
        console.warn(`Could not remove ${source}:`, err.message);
    }
}

console.log('Starting media move...');
moveFiles(imagesSource, imagesDest);
moveFiles(videosSource, videosDest);
console.log('Media move completed!');
