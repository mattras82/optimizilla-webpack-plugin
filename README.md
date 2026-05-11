# optimizilla-webpack-plugin

A Webpack 5 plugin to optimize (compress) images through [imagemin](https://github.com/imagemin/imagemin). Unlike the other image optimization plugins for Webpack, which use Webpack's default caching mechanism, this plugin uses a JSON file to track the files that have been processed. This is necessary for projects & repositories that are shared across different systems/environments. When the image-lock.json file is tracked by your source control, each image is only processed once.

This plugin used to be a wrapper of the [optimizilla-cli](https://www.npmjs.com/package/optimizilla-cli) tool, which uploaded the files to [optimizilla](https://imagecompressor.com) for compression. That API has been deprecated, so this package has been updated to optimize files locally to maintain support for the image-lock file. 


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


## Options

#### ext

Type: `string[] | string`

Default value: `['png', 'jpg', 'jpeg', 'gif', 'svg']`

Array of file extensions to search for in the `src` directory.


#### src

Type: `string`

Default value: `process.cwd()`

The working directory path that the [fast-glob](https://github.com/mrmlnc/fast-glob) searches in.


#### replace

Type: `bool`

Default value: `true`

Determines whether or not to replace the original image files. When set to `false`, the tool will append ".min" to each filename before the file extension.


#### maxFileSize

Type: `number`

Default value: `5242880` (5MB)

The upper limit for each file size. This limit is necessary due to the underlying imagemin architecture. Increasing this limit may result in buffer/memory limit errors while compressing. Some images may need to be resized before this plugin can minify them.


#### concurrency

Type: `number`

Default value: `undefined`

The maximum number of concurrent optimization processes to run at one time. If left undefined, the package will use Node's `os` package to determine the correct value based on the system running the process.


#### imagemin

Type: `object`

Default value: 
```javascript
{
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
}
```

The list of imagemin plugins to use and their respective options.
 


## Contributors
 - [mattras82](https://github.com/mattras82)


## License
http://www.opensource.org/licenses/mit-license.php