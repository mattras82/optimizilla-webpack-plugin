const plugin = require('./index');
const path = require('path');
const c = require('./util/logs');
const fs = require('fs');

let testPath = path.resolve(__dirname, 'test');

if (fs.existsSync(path.resolve(testPath, 'image-lock.json'))) {
  fs.unlinkSync(path.resolve(testPath, 'image-lock.json'));
}

let instance = new plugin({
  src: testPath,
  replace: false
});

const fakeCompilation = {
  assets: []
};

const fakeCallback = () => {
  c.success('Fake callback has been called');
};

const fakeCompiler = {
  hooks: {
    emit: {
      tapAsync: (name, run) => {
        c.log(`running ${name} plugin`);
        run(fakeCompilation, fakeCallback);
      }
    }
  }
};

instance.apply(fakeCompiler);


