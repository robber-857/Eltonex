const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'dist');
// The clean target is fixed beneath this checkout; never publish the repository root.
if (path.dirname(destination) !== root || path.basename(destination) !== 'dist') throw new Error('Invalid build directory');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination);
const files = ['index.html', 'about.html', 'contact.html', 'services.html', 'styles.css', 'layout.css', 'hero.css', 'about.css', 'contact.css', 'footer.css', 'services.css', 'capability-ticker.css', 'script.js', 'contact.js', 'services.js', 'hero-film.js', 'hero-scene.js', 'capability-ticker.js'];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(destination, file));
fs.cpSync(path.join(root, 'assets'), path.join(destination, 'assets'), { recursive: true });
fs.mkdirSync(path.join(destination, 'admin'));
for (const file of ['index.html', 'admin.css', 'admin.js']) fs.copyFileSync(path.join(root, 'admin', file), path.join(destination, 'admin', file));
console.log('Built dist/: public pages, assets and admin UI only.');
