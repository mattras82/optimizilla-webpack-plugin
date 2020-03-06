const plugin = require('./index');
const path = require('path');
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
  console.log('\n\nFake callback has been called\n\n');
};

const fakeCompiler = {
  hooks: {
    emit: {
      tapAsync: (name, run) => {
        console.log(`\nrunning ${name} plugin\n`);
        run(fakeCompilation, fakeCallback);
      }
    }
  }
};

instance.apply(fakeCompiler);


