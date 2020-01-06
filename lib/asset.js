class Asset {
  constructor(name, size, filePath) {
    this.name = name;
    this.originalSize = size;
    this.filePath = filePath;
    this.failed = false;
    this.success = false;
    this.newSize = false;
    this.error = '';
  }

  setError(err) {
    this.failed = true;
    this.error += err;
  }

  checkSize(size) {
    if (size <= this.originalSize) {
      this.newSize = size;
      this.success = true;
      return this.originalSize - this.newSize;
    }
    return 0;
  }

  getLockObject() {
    return {
      orig: this.originalSize,
      new: this.newSize
    }
  }
}

module.exports = Asset;