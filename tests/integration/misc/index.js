const fs = require('node:fs');
const path = require('node:path');

module.exports = (session) => {
  describe('misc', () => {
    fs.readdirSync(__dirname)
      .filter((file) => file.endsWith('.js'))
      .filter((file) => file !== 'index.js')
      .forEach((file) => require(path.join(__dirname, file))(session));
  });
};
