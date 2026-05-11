// const production = process.env.NODE_ENV === "production";

// PLUGINS
import {OptimizillaPlugin as ThisPlugin} from "../src/index.js";
import {default as CopyWebpackPlugin} from 'copy-webpack-plugin';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default (env, argv) => {

  return {
    mode: "development",
    entry: {
      test: [path.resolve(__dirname, "./dummy.js")],
    },
    output: {
      path: path.resolve(__dirname, "./dist"),
      filename: "[name].js",
      publicPath: "auto",
    },

    plugins: [
      new ThisPlugin({
        src: path.resolve(__dirname, "./images"),
        // replace: false,
        maxFileSize: 7 * 1024 * 1024,
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, './images/subdir'),
            to: 'assets',
            globOptions: { ignore: ["**/*.json"] },
          },
        ],
      }),
    ],
  };
};
