'use strict';
const asset = require('./lib/asset');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const lockFile = 'image-lock.json';

class OptimizillaPlugin {
  constructor(opts) {
    debugger;

    this.pluginName = 'optimizilla-webpack-plugin';
    this.options = Object.assign({
      replace: false,
      ext: ['png', 'jpg', 'jpeg'],
      src: ''
    }, opts);

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
    fs.writeFile(lockPath, JSON.stringify(this.lock, null, 2));
  }

  shutDown() {
    console.log('\n\n', `Optimized ${this.optimizeCount} files`, '\n');

    if (this.removedBytes) {
      let percent = (this.removedBytes / this.totalSize * 100).toFixed(2);
      console.log('\n', `Removed ${(this.removedBytes / 1000.0).toFixed(2)}KB (${percent}% reduction)`, '\n\n');
    }

    if (this.lock) {
      this.writeLock();
    }
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync(this.pluginName,(compilation, callback) => {
      let queue = [];

      Object.entries(compilation.assets).forEach(([key,val]) => {
        if (this.reg.test(key) && !this.isLocked(key)) {
          let size = val.size();
          this.totalSize += size;
          queue.push(new asset(key, size));
        }
      });

      if (queue.length > 0) {
        console.log('\n\n\n', `Optimizing ${queue.length} images ...`);

        let cwd = path.resolve(this.options.src);
        let command = /^win/.test(process.platform) ? 'optimizilla.cmd' : 'optimizilla';

        queue.forEach((asset, i) => {
          // Process optimize-cli command
          let opt = spawn(command, [asset.name, '-r'], {cwd: cwd});

          opt.stderr.on('data', (data) => {
            asset.setError(data);
          });

          opt.on('close', () => {
            if (!asset.failed) {
              let stats = fs.statSync(path.resolve(cwd, asset.name));
              if (stats) {
                this.removedBytes += asset.checkSize(stats.size);
              }
              this.lockAsset(asset);
            }
            // Remove the optimized image from the queue
            queue = queue.filter(a => a !== asset);
            if (queue.length === 0) {
              this.shutDown();
              console.log('\n\n', 'Running callback: ', typeof callback, '\n\n');
              callback();
            }
          });
        });
      } else {
        this.shutDown();
        console.log('\n\n', 'Running callback: ', typeof callback, '\n\n');
        callback();
      }
    });
  }
}

module.exports = OptimizillaPlugin;