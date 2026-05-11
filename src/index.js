// @ts-check
"use strict";
import { Asset as AssetForMin } from "./lib/asset.js";
import { logs as c } from "./util/logs.js";
import path from "path";
import fs from "fs";
import os from "os";

/** @typedef {import("webpack").Compiler} Compiler */
/** @typedef {import("webpack").Compilation} Compilation */
/** @typedef {import("webpack").Asset} Asset */
/** @typedef {import("webpack").AssetInfo} AssetInfo */
/** @typedef {import("webpack").sources.Source} Source */
/** @typedef {import("imagemin").Options} ImageminOptions */

/**
 * @template T
 * @typedef {() => Promise<T>} Task
 */

/**
 * @typedef {string | [string, object | undefined]} RawPlugin
 * @typedef {{ plugins: RawPlugin[] }} RawImageminConfig
 */

/**
 * @typedef {import("./lib/asset.js").AssetLock} AssetLock
 * @typedef {Record<string, AssetLock>} LockRecord
 * @typedef {Record<string, LockRecord | any>} LockPath
 * @typedef {{version: number, images: LockPath}} LockObject
 */

/**
 * @typedef {object} PluginOptions
 * @property {boolean=} replace set to true to replace the original files after minification
 * @property {Array<string>|string=} ext list of file extensions to minify
 * @property {string=} src the source directory that contains the files
 * @property {number=} maxFileSize the maximum file size in bytes
 * @property {number=} concurrency maximum number of concurrency optimization processes in one time
 * @property {RawImageminConfig=} imagemin the list of imagemin plugins and their respective options
 */

const lockVersion = 2;
const lockFile = "image-lock.json";
const hasOwn = Object.prototype.hasOwnProperty;

class OptimizillaPlugin {
  /**
   * @param {PluginOptions=} opts Plugin options.
   */
  constructor(opts) {
    this.pluginName = "optimizilla-webpack-plugin";
    this.options = Object.assign(
      {
        replace: true,
        ext: ["png", "jpg", "jpeg", "gif", "svg"],
        src: process.cwd(),
        concurrency: undefined,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        imagemin: {
          plugins: [
            ["mozjpeg", { quality: 80, progressive: true }],
            ["pngquant", { quality: [0.65, 0.8], speed: 1 }],
            ["gifsicle", { interlaced: true }],
            [
              "svgo",
              {
                plugins: [
                  {
                    name: "preset-default",
                  },
                  {
                    name: "addAttributesToSVGElement",
                    params: {
                      attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
                    },
                  },
                ],
              },
            ],
          ],
        },
      },
      opts
    );

    if (!Array.isArray(this.options.ext)) this.options.ext = [this.options.ext];

    this.reg = new RegExp(
      "(?<!\\.min)\\.(" + this.options.ext.join("|") + ")$",
      "i"
    );

    this.lock = this.getEmptyLock();
    this.optimizeCount = 0;
    this.removedBytes = 0;
    this.totalSize = 0;
    /**
     * @type {Error[]}
     */
    this.errors = [];

    this.optimizing = false;
    this.upgradedLock = false;
  }
  /**
   *
   * @returns {LockObject}
   */
  getEmptyLock() {
    return {
      version: lockVersion,
      images: {},
    };
  }

  /**
   *
   * @returns {Promise<LockObject>}
   */
  async getLock() {
    if (Object.keys(this.lock.images).length) {
      return this.lock;
    }
    try {
      const lockPath = path.resolve(this.options.src, lockFile);
      const lock = await fs.promises.readFile(lockPath);
      return await this.checkLockVersion(JSON.parse(lock.toString()));
    } catch (e) {
      if (e instanceof Error) {
        if ("code" in e && e.code === "ENOENT") return this.getEmptyLock();
        c.error(`Could not read ${lockFile}: ${e.message}`);
      } else {
        c.error("Unknown error reading lock file. " + e);
      }
    }
    return this.getEmptyLock();
  }

  /**
   *
   * @param {LockObject} lockObj
   * @returns {Promise<LockObject>}
   */
  async checkLockVersion(lockObj) {
    if (lockObj.version === lockVersion) return Promise.resolve(lockObj);
    return await this.upgradeLockFile(lockObj);
  }

  /**
   *
   * @param {LockPath} oldLock
   * @returns {Promise<LockObject>}
   */
  async upgradeLockFile(oldLock) {
    const newLock = this.getEmptyLock();
    this.upgradedLock = true;
    c.emphasis(`Upgrading ${lockFile} file`);
    c.log("This is a one time operation. Please be patient...");
    if (!hasOwn.call(oldLock, "version")) {
      const cwd = path.resolve(this.options.src);
      const fg = (await import("fast-glob")).default;
      const limit = Math.max(
        1,
        this.options.concurrency ?? this.cpuCount() - 1
      );
      const upgradeTasks = Object.keys(oldLock).map((name) => async () => {
        let files = await fg(`**/${name}`, { cwd: cwd, onlyFiles: true });
        const assetLock = /** @type {AssetLock} */ (oldLock[name]);
        if (files.length > 1) {
          c.warn(`Found multiple entries for: ${name}`);
          files = files.filter((filePath) => {
            const stats = fs.statSync(path.resolve(cwd, filePath));
            return stats.size === assetLock.new;
          });
        }
        return files.forEach((filePath) => {
          const lockPath = this.getLockedPath(filePath, newLock);
          lockPath[name] = assetLock;
        });
      });
      await this.throttleAll(limit, upgradeTasks);
      c.success(`${lockFile} has been upgraded to version ${lockVersion}`);
    } else {
      throw new Error(
        `Unsupported lockfile version in ${lockFile}: ${oldLock.version}`
      );
    }
    return newLock;
  }

  /**
   *
   * @param {string} filePath
   * @param {number} size
   * @returns {boolean}
   */
  isLocked(filePath, size, lockObj = this.lock) {
    const parts = filePath.split(/[\\/]/);
    const name = path.basename(filePath);
    let lockPath = lockObj.images;
    return parts.every((part) => {
      if (hasOwn.call(lockPath, part)) {
        lockPath = lockPath[part];
        if (part === name) {
          if (lockPath.failed) {
            return lockPath.orig == size;
          }
          if (lockPath.skipped) {
            return this.options.maxFileSize && size > this.options.maxFileSize;
          }
        }
        return true;
      }
      return false;
    });
  }

  /**
   *
   * @param {string} filePath
   * @param {LockObject} lockObj
   * @returns {LockPath | LockRecord}
   */
  getLockedPath(filePath, lockObj = this.lock) {
    const parts = filePath.split(/[\\/]/);
    const name = parts.pop();
    const lockPath = parts.reduce((prev, part) => {
      if (!hasOwn.call(prev, part)) {
        prev[part] = {};
      }
      return prev[part];
    }, lockObj.images);
    return lockPath;
  }

  /**
   *
   * @param {AssetForMin} asset
   * @returns {void}
   */
  lockAsset(asset) {
    const lockPath = this.getLockedPath(asset.filePath);
    lockPath[asset.name] = asset.getLockObject();
    if (asset.success) this.optimizeCount++;
  }

  async writeLock() {
    let lockPath = path.resolve(this.options.src, lockFile);
    try {
      await fs.promises.writeFile(lockPath, JSON.stringify(this.lock, null, 2));
      return true;
    } catch (err) {
      this.errors.push(
        err instanceof Error
          ? err
          : new Error(
              /**  @type {string} */
              (err == undefined ? "Undefined error" : err)
            )
      );
    }
    return false;
  }

  /**
   *
   * @param {Compilation} compilation
   * @returns {Promise<void>}
   */
  async shutDown(compilation) {
    if (this.removedBytes) {
      c.success(`Optimized ${this.optimizeCount} files`);
      let percent = ((this.removedBytes / this.totalSize) * 100).toFixed(2);
      c.log(
        `Removed ${(this.removedBytes / 1000.0).toFixed(
          2
        )}KB (${percent}% reduction)`
      );
    } else if (this.totalSize) {
      c.log("No data was removed from the image files");
    }

    if (this.optimizing || this.upgradedLock) {
      if (this.lock && Object.keys(this.lock).length) {
        await this.writeLock();
      }
      this.optimizing = false;
      this.upgradedLock = false;
    }

    this.errors.forEach((err) => {
      compilation.errors.push(new Error(`Optimizilla Plugin: ${err.message}`));
    });
  }

  /**
   * Run tasks with limited concurrency.
   * @template T
   * @param {number} limit Limit of tasks that run at once.
   * @param {Task<T>[]} tasks List of tasks to run.
   * @returns {Promise<T[]>} A promise that fulfills to an array of the results
   */
  async throttleAll(limit, tasks) {
    return new Promise((resolve, reject) => {
      const result = /** @type {T[]} */ ([]);
      const entries = tasks.entries();
      let tasksFulfilled = 0;
      if (limit > tasks.length) {
        limit = tasks.length;
      }
      const next = () => {
        const { done, value } = entries.next();
        if (done) {
          if (tasksFulfilled === tasks.length) {
            resolve(result);
            return;
          }
          return;
        }
        const [index, task] = value;

        /**
         * @param {T} taskResult task result
         */
        const onFulfilled = (taskResult) => {
          result[index] = taskResult;
          tasksFulfilled += 1;
          next();
        };
        task().then(onFulfilled, reject);
      };
      for (let i = 0; i < limit; i++) {
        next();
      }
    });
  }

  /**
   *
   * @returns {number}
   */
  cpuCount() {
    if (typeof os.availableParallelism === "function") {
      return os.availableParallelism();
    }
    return (os.cpus() ?? []).length || 1;
  }

  /**
   * @param {RawImageminConfig} imageminConfig
   * @returns {Promise<ImageminOptions>}
   */
  async imageminNormalizeConfig(imageminConfig) {
    if (
      !imageminConfig ||
      !imageminConfig.plugins ||
      (imageminConfig.plugins && imageminConfig.plugins.length === 0)
    ) {
      throw new Error(
        "No plugins found for `imagemin`, please read documentation"
      );
    }

    /**
     * @type {import("imagemin").Plugin[]}
     */
    const plugins = [];
    for (const plugin of imageminConfig.plugins) {
      const isPluginArray = Array.isArray(plugin);
      if (typeof plugin === "string" || isPluginArray) {
        const pluginName = isPluginArray ? plugin[0] : plugin;
        const pluginOptions = isPluginArray ? plugin[1] : undefined;
        let requiredPlugin = null;
        let requiredPluginName = pluginName.startsWith("imagemin")
          ? pluginName
          : `imagemin-${pluginName}`;
        try {
          requiredPlugin = (await import(requiredPluginName)).default(
            pluginOptions
          );
        } catch {
          requiredPluginName = pluginName;
          try {
            requiredPlugin = (await import(requiredPluginName)).default(
              pluginOptions
            );
          } catch (error) {
            const pluginNameForError = pluginName.startsWith("imagemin")
              ? pluginName
              : `imagemin-${pluginName}`;
            const err = new Error(
              `Unknown plugin: ${pluginNameForError}\n\nDid you forget to install the plugin?\nYou can install it with:\n\n$ npm install ${pluginNameForError} --save-dev`
            );
            err.cause = error;
            throw err;
          }
        }

        plugins.push(requiredPlugin);
      } else {
        throw new Error(
          `Invalid plugin configuration '${JSON.stringify(
            plugin
          )}', plugin configuration should be 'string' or '[string, object]'"`
        );
      }
    }
    return {
      plugins,
    };
  }

  /**
   * @private
   * @param {Compiler} compiler compiler
   * @param {Compilation} compilation compilation
   * @param {Record<string, Source>} assets assets
   * @returns {Promise<void>}
   */
  async optimize(compiler, compilation, assets) {
    const queue = /**@type {AssetForMin[]} */ ([]);
    const cwd = path.resolve(this.options.src);
    this.lock = await this.getLock();

    Object.entries(assets).forEach(([filePath, src]) => {
      let name = path.basename(filePath);
      if (this.reg.test(name)) {
        const wpAsset = compilation.getAsset(filePath);
        if (!wpAsset) return;
        const size = src.size();
        const wpAssetInfo = {
          src: src,
          assetPath: filePath,
        };
        const { info } = wpAsset;

        // Avoiding duplicate runs
        if (info.minimized) return;

        if (info && info.sourceFilename) {
          // If the asset is being copied to a new dest, we need to normalize
          // the file path relative to our src directory before we check the
          // lock file.
          filePath = path
            .relative(cwd, info.sourceFilename)
            .replace(/\\/g, "/");
        }
        if (!this.isLocked(filePath, size)) {
          this.totalSize += size;
          queue.push(new AssetForMin(name, filePath, size, wpAssetInfo));
        }
      }
    });

    if (!this.optimizing) {
      const fg = (await import("fast-glob")).default;
      const ext = this.options.ext.map(
        (/** @type {string} */ e) => `**/*.${e}`
      );
      const fastGlobs = fg.sync(ext, {
        cwd: cwd,
        onlyFiles: true,
        stats: true,
        ignore: [
          ...queue.map((asset) => "**/" + fg.escapePath(asset.filePath)),
          "**/*.min.*",
        ],
      });
      fastGlobs.forEach((obj) => {
        if (!this.reg.test(obj.name)) return;

        let size = 0;
        if (obj.stats) {
          size = obj.stats.size;
        }
        if (!this.isLocked(obj.path, size)) {
          this.totalSize += size;
          queue.push(new AssetForMin(obj.name, obj.path, size));
        }
      });
    }

    if (queue.length > 0) {
      this.optimizing = true;
      try {
        c.log(
          `Optimizing ${queue.length} image${queue.length > 1 ? "s" : ""} ...`
        );

        const imagemin = (await import("imagemin")).default;
        const { RawSource } = compiler.webpack.sources;

        const limit = Math.max(
          1,
          this.options.concurrency ?? this.cpuCount() - 1
        );

        /**
         * @type {ImageminOptions}
         */
        const optionsNormalized = await this.imageminNormalizeConfig(
          /**
           * @type {RawImageminOptions}
           */
          this.options.imagemin ?? {}
        );

        const optimizeTasks = queue.map((asset) => async () => {
          let result;

          if (
            this.options.maxFileSize &&
            asset.originalSize > this.options.maxFileSize
          ) {
            c.warn(
              `Skipping ${asset.name} — exceeds maxFileSize (${asset.originalSize} bytes)`
            );
            asset.skipped = true;
            this.lockAsset(asset);
            return false;
          }
          const source = await asset.getSource(cwd);
          if (source == null) {
            asset.setError(new Error("Could not get source buffer"));
            return false;
          }
          try {
            result = await imagemin.buffer(source, optionsNormalized);
            if (!Buffer.isBuffer(result)) {
              result = Buffer.from(result);
            }
          } catch (error) {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code == "EOF"
            ) {
              asset.failed = true;
              this.lockAsset(asset);
              compilation.warnings.push(
                new Error(
                  `Optimizilla Plugin: ${asset.name} is too large for mozjpeg

                  Consider lowering the maxFileSize option for this plugin to avoid this error
                  `
                )
              );
              return false;
            } else {
              asset.setError(
                error instanceof Error
                  ? error
                  : new Error(
                      /**  @type {string} */
                      (error == undefined ? "Undefined error" : error)
                    )
              );
            }
            result = null;
          }

          if (Buffer.isBuffer(result)) {
            const newSize = Buffer.byteLength(result);
            const removedBytes = asset.checkSize(newSize);

            // Only write to disk if new file is smaller
            if (removedBytes > 0) {
              this.removedBytes += removedBytes;
              const filename = asset.getOutputFilename(this.options.replace);
              // Write the minified file back to the src directory
              await fs.promises.writeFile(path.resolve(cwd, filename), result);
              if (asset.isWebpack()) {
                // If this asset came from the compilation assets
                // then we need to let WebPack know so that the
                // minified data is reflected in the compilation output
                const src = new RawSource(result);
                const info = {
                  minimized: true,
                  minimizedBy: ["imagemin"],
                };
                const assetKey = asset.webpackInfo?.assetPath || "";
                if (this.options.replace) {
                  compilation.updateAsset(assetKey, src, info);
                } else {
                  compilation.emitAsset(
                    asset.generateMinifiedFilename(assetKey),
                    src,
                    info
                  );
                }
              }
            }
            this.lockAsset(asset);
            return true;
          } else {
            this.errors.push(asset.getError());
            this.lockAsset(asset);
          }

          return false;
        });

        await this.throttleAll(limit, optimizeTasks);
      } catch (e) {
        const origErr =
          e instanceof Error
            ? e
            : new Error(
                /**
                 * @type {string}
                 */
                (e == undefined ? "Undefined error" : e)
              );
        this.errors.push(
          new Error(`Optimizilla queue processing: ${origErr.message}`)
        );
      }
    }
  }

  /**
   * @param {Compiler} compiler compiler
   */
  apply(compiler) {
    const { pluginName } = this;

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      compilation.hooks.afterSeal.tapPromise(
        {
          name: pluginName,
        },
        async () => {
          await this.shutDown(compilation);
        }
      );
      compilation.hooks.processAssets.tapPromise(
        {
          name: pluginName,
          stage:
            compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
          additionalAssets: true,
        },
        async (assets) => {
          await this.optimize(compiler, compilation, assets);
        }
      );
    });
  }
}

export { OptimizillaPlugin };
