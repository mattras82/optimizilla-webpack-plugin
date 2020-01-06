'use strict';
const asset = require('./lib/asset');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
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
        console.error('\n\n', 'Could not save image-lock.json file');
        throw err;
      }
    });
  }

  shutDown(callback) {

    if (this.removedBytes) {
      console.log('\n\n', `Optimized ${this.optimizeCount} files`, '\n');
      let percent = (this.removedBytes / this.totalSize * 100).toFixed(2);
      console.log('\n', `Removed ${(this.removedBytes / 1000.0).toFixed(2)}KB (${percent}% reduction)`, '\n\n');
    }

    if (this.lock) {
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

      fg(ext, {
        cwd: cwd,
        onlyFiles: true,
        stats: true
      }).then(globs => {

        globs.forEach(obj => {
          queue.push(new asset(obj.name, obj.stats.size, path.resolve(cwd, obj.path)));
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

          let command = /^win/.test(process.platform) ? 'optimizilla.cmd' : 'optimizilla';

          if (queue.length > 20) {
            console.log('\n\n\n', 'WARNING: ImageCompressor.com allows 20 images at a time.');
            console.log('\n', `Removing ${queue.length - 20} images from the current queue.`);
            console.log('\n\n', 'Please wait 3 - 5 minutes before running this again.');
            queue = queue.slice(0, 20);
          }

          console.log('\n\n\n', `Optimizing ${queue.length} images ...`);

          queue.forEach(asset => {
            // Process optimize-cli command
            let flags = [asset.name];
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
              }
              // Remove the optimized image from the queue
              queue = queue.filter(a => a !== asset);

              if (queue.length === 0) {
                this.shutDown(callback);
                callback();
              }
            });
          });
        } else {
          this.shutDown(callback);
        }
      });
    });
  }
}

module.exports = OptimizillaPlugin;