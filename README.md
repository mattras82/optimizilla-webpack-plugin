# optimizilla-webpack-plugin

A Webpack 4 plugin to optimize & compress images through [optimizilla](https://imagecompressor.com/). This is simply a wrapper of the [optimizilla-cli](https://www.npmjs.com/package/optimizilla-cli) tool to be used with webpack.


## Installation
```shell
$ npm install -D optimizilla-webpack-plugin

```

## Example Webpack Config

```javascript
const optimizillaWebpackPlugin = require('optimizilla-webpack-plugin');

    //in your webpack plugins array
    module.exports = {
      plugins: [
          new optimizillaWebpackPlugin(
            ext: ['png', 'jpg', 'jpeg'],
            src: 'images'
          )
      ]
    }
```

## Contributors
 - [mattras82](https://github.com/mattras82)

## License
http://www.opensource.org/licenses/mit-license.php