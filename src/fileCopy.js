/**
 * Helper build utility to copy non-built files to the dist directory.  This itself file is not included in the distributed project.
 */

const path = require('path');

const fs = require('fs-extra');

// List of files to copy into the dist directory on build
[
    './package.json',
    './README.md',
].forEach(file => fs.copyFileSync(path.resolve(file), path.resolve('dist', path.basename(file))));
