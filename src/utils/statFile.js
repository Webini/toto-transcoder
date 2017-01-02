const fs = require('fs');

module.exports = function statFile(file) {
  try {
    return fs.statSync(file)['size'];
  } catch(e) { 
    return null;
  }
};