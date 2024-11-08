'use strict';
const asset = require('./lib/asset');
const c = require('./util/logs');
const path = require('path');
const fs = require('fs');
const lockFile = 'image-lock.json';

class OptimizillaPlugin {
  constructor(opts) {
    debugger;

    this.pluginName = 'optimizilla-webpack-plugin';
    this.options = Object.assign({
      replace: true,
      ext: ['png', 'jpg', 'jpeg'],
      src: process.cwd()
    }, opts);

    if (!Array.isArray(this.options.ext))
      this.options.ext = [this.options.ext];

    this.reg = new RegExp("\.(" + this.options.ext.join('|') + ')$', 'i');

    this.lock = this.getLock();
    this.optimizeCount = 0;
    this.removedBytes = 0;
    this.totalSize = 0;
  }

  getLock() {
    try {
      let lockPath = path.resolve(this.options.src, lockFile);
      let lock = fs.readFileSync(lockPath);
      return JSON.parse(lock);
    } catch(e) {
      return {};
    }
  }

  isLocked(key) {
    return this.lock.hasOwnProperty(key);
  }

  lockAsset(asset) {
    this.lock[asset.name] = asset.getLockObject();
    if (asset.success)
      this.optimizeCount++;
  }

  writeLock() {
    let lockPath = path.resolve(this.options.src, lockFile);
    fs.writeFile(lockPath, JSON.stringify(this.lock, null, 2), err => {
      if (err) {
        c.error('Could not save image-lock.json file');
        throw err;
      }
    });
  }

  shutDown(callback) {

    if (this.removedBytes) {
      c.success(`Optimized ${this.optimizeCount} files`);
      let percent = (this.removedBytes / this.totalSize * 100).toFixed(2);
      c.log(`Removed ${(this.removedBytes / 1000.0).toFixed(2)}KB (${percent}% reduction)`);
    } else {
      c.log('No data was removed from the image files');
    }

    if (this.lock && Object.keys(this.lock).length) {
      this.writeLock();
    }

    callback();
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync(this.pluginName,(compilation, callback) => {
      let queue = [];
      let cwd = path.resolve(this.options.src);
      let globs = [];

      let ext = this.options.ext.map(e => `**.${e}`);

      const fg = require('fast-glob');
      let fastGlobs = fg.sync(ext, {cwd: cwd, onlyFiles: true, stats: true});
      fastGlobs.forEach(obj => {
        if (!this.isLocked(obj.name)) {
          globs.push(obj.path);
          this.totalSize += obj.stats.size;
          queue.push(new asset(obj.name, obj.stats.size, path.resolve(cwd, obj.path)));
        }
      });

      Object.entries(compilation.assets).forEach(([key,val]) => {
        let name = path.basename(key);
        if (this.reg.test(name) && !this.isLocked(name) && globs.indexOf(name) === -1) {
          let size = val.size();
          this.totalSize += size;
          queue.push(new asset(name, size, path.resolve(cwd, key)));
        }
      });

      if (queue.length > 0) {

        try {
          let command = `npx${/^win/.test(process.platform) ? '.cmd' : ''}`;

          if (queue.length > 20) {
            c.warn('WARNING: ImageCompressor.com allows 20 images at a time.');
            c.log(`Removing ${queue.length - 20} images from the current queue.`);
            c.emphasis('Please wait 3 - 5 minutes before running this again.');
            queue = queue.slice(0, 20);
          }

          console.log('\n\n\n', `Optimizing ${queue.length} images ...`);

          const { spawn } = require('child_process');
          queue.forEach(asset => {
            // Process optimize-cli command
            let flags = ['optimizilla', asset.name];
            if (this.options.replace) {
              // Replace each image file
              flags.push('-r')
            }
            let opt = spawn(command, flags, {cwd: path.dirname(asset.filePath)});

            opt.stderr.on('data', (data) => {
              asset.setError(data);
            });

            opt.on('close', () => {
              if (!asset.failed) {
                let stats = fs.statSync(asset.filePath);
                if (stats) {
                  this.removedBytes += asset.checkSize(stats.size);
                }
                this.lockAsset(asset);
              } else {
                c.error(`\nError optimizing ${asset.name}`);
                console.log(asset.error);
              }
              // Remove the optimized image from the queue
              queue = queue.filter(a => a !== asset);

              if (queue.length === 0) {
                this.shutDown(callback);
              }
            });
          });
        } catch(e) {
          c.error('Error in Optimizilla Plugin:');
          console.log(e);
          this.shutDown(callback);
        }
      } else {
        this.shutDown(callback);
      }
    });
  }
}

module.exports = OptimizillaPlugin;