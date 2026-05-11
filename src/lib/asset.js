// @ts-check
"use strict";

import path from "path";
import fs from "fs";

/** @typedef {import("webpack").sources.Source} Source */

/**
 * @typedef {object} wpAssetInfo
 * @property {Source} src The WebPack Source data for the asset
 * @property {string} assetPath The key for this asset in the WebPack compilation
 */

/**
 * @typedef {object} AssetLock
 * @property {number} orig The size of the unmified file
 * @property {number=} new The size of the minified file
 * @property {boolean=} failed Set to true if we're locking a failed file
 * @property {boolean=} skipped Set to true if we're locking a file that exceeds the max size limit
 */

class Asset {
  /**
   *
   * @param {string} name
   * @param {string} filePath
   * @param {number} size
   * @param {wpAssetInfo | null=} wpAssetInfo
   */
  constructor(name, filePath, size, wpAssetInfo = null) {
    this.name = name;
    this.originalSize = size;
    this.filePath = filePath;
    this.failed = false;
    this.success = false;
    this.skipped = false;
    this.newSize = 0;
    this.webpackInfo = wpAssetInfo;
    /** @type {Error[]} */
    this.errors = [];
  }

  /**
   *
   * @param {Error} err
   */
  setError(err) {
    this.failed = true;
    // @ts-ignore
    const newError = new Error(`Error with '${this.name}': ${err.shortMessage ?? err.message}`);
    this.errors.push(newError);
  }

  /**
   *
   * @returns {Error}
   */
  getError() {
    if (this.errors.length === 0) {
      this.failed = true;
      return new Error(`Optimization failed (no result) for '${this.name}'`);
    }
    if (this.errors.length === 1 && this.errors[0] instanceof Error) {
      return this.errors[0];
    }
    return new Error(this.errors.map((e) => e.message).join("\n"));
  }

  /**
   *
   * @param {number} size
   * @returns {number}
   */
  checkSize(size) {
    this.newSize = size;
    if (size <= this.originalSize) {
      this.success = true;
      return this.originalSize - this.newSize;
    }
    return 0;
  }

  /**
   *
   * @returns {AssetLock}
   */
  getLockObject() {
    if (this.failed) {
      return {
        failed: true,
        orig: this.originalSize,
      };
    }
    if (this.skipped) {
      return {
        skipped: true,
        orig: this.originalSize
      };
    }
    return {
      orig: this.originalSize,
      new: this.newSize,
    };
  }

  /**
   * @param {string} cwd
   * @returns {Promise<Buffer | null>}
   */
  async getSource(cwd) {
    let input = null;
    if (this.webpackInfo != null) {
      input = this.webpackInfo.src.source();
    } else {
      try {
        input = await fs.promises.readFile(path.resolve(cwd, this.filePath));
      } catch {}
    }
    if (input != null && !Buffer.isBuffer(input)) {
      input = Buffer.from(input);
    }
    return input;
  }

  /**
   *
   * @param {boolean} replaceOriginal
   */
  getOutputFilename(replaceOriginal = true) {
    if (replaceOriginal) {
      return this.filePath;
    }

    return this.generateMinifiedFilename(this.filePath);
  }

  /**
   *
   * @param {string} filename
   * @returns {string}
   */
  generateMinifiedFilename(filename) {
    const parsed = path.parse(filename);
    return path.format({
      dir: parsed.dir,
      name: parsed.name + ".min",
      ext: parsed.ext,
    });
  }

  /**
   *
   * @returns { boolean }
   */
  isWebpack() {
    return this.webpackInfo !== null;
  }
}

export { Asset };
