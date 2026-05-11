'use strict';

import pc from 'picocolors';

let logs = {};

/**
 * Normal console log (white color)
 * @param {string} m
 */
logs.log = m => {
  console.log(pc.white(`\n${m}\n`));
};

/**
 * Green & bold console log
 * @param {string} m
 */
logs.success = m => {
  console.log(pc.green(pc.bold(`\n${m}\n`)));
};

/**
 * Bright yellow console log
 * @param {string} m
 */
logs.warn = m => {
  console.log(pc.yellowBright(`\n${m}\n`));
};

/**
 * Red & bold console log
 * @param {string} m
 */
logs.error = m => {
  console.log(pc.red(pc.bold(`\n${m}\n`)));
};

/**
 * Underline, magenta, & bold console log
 * @param {string} m
 */
logs.emphasis = m => {
  console.log(pc.underline(pc.magenta(pc.bold(`\n${m}\n`))));
};

/**
 * Bright yellow message with a link to the repo on NPM
 */
logs.info = () => {
  logs.warn('\nFor more info, read the docs at https://github.com/mattras82/optimizilla-webpack-plugin\n');
};

/**
 * Returns a Promise that resolves after the given duration
 * @param {number} duration
 * @returns {Promise}
 */
logs.timeout = duration => {
  return new Promise(r => setTimeout(r, duration));
};

export { logs };
