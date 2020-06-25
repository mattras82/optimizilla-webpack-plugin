'use strict';

const colors = require('colors/safe');

let logs = {};

/**
 * Normal console log (white color)
 * @param {string} m
 */
logs.log = m => {
  console.log(colors.white(`\n${m}\n`));
};

/**
 * Green & bold console log
 * @param {string} m
 */
logs.success = m => {
  console.log(colors.green.bold(`\n${m}\n`));
};

/**
 * Bright yellow console log
 * @param {string} m
 */
logs.warn = m => {
  console.log(colors.brightYellow(`\n${m}\n`));
};

/**
 * Red & bold console log
 * @param {string} m
 */
logs.error = m => {
  console.log(colors.red.bold(`\n${m}\n`));
};

/**
 * Underline, magenta, & bold console log
 * @param {string} m
 */
logs.emphasis = m => {
  console.log(colors.underline.magenta.bold(`\n${m}\n`));
};

/**
 * Bright yellow message with a link to the repo on NPM
 */
logs.info = () => {
  logs.warn('\nFor more info, read the docs at https://github.com/mattras82/optimizilla-webpack-plugin\n');
};

/**
 * Returns a Promise that resolves after the given duration
 * @param {int} duration
 * @returns {Promise}
 */
logs.timeout = duration => {
  return new Promise(r => setTimeout(r, duration));
};

module.exports = logs;
