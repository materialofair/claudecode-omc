/* eslint-disable no-console */
const { artifact } = require('./artifact');

async function skill(args, flags = {}) {
  flags.type = 'skills';
  await artifact(args, flags);
}

module.exports = { skill };
