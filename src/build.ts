import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import * as rimraf from 'rimraf';

export function build(buildDirectory: string, program: string) {
  // Clean things up
  try {
    rimraf.sync(buildDirectory);
    fs.mkdirSync(buildDirectory);
  } catch (e) {}

  fs.writeFileSync(path.join(buildDirectory, 'lib.cc'), fs.readFileSync(path.join(__dirname, 'compile/lib.cc')));
  fs.writeFileSync(path.join(buildDirectory, 'jsc.cc'), program);
  fs.writeFileSync(path.join(buildDirectory, 'binding.gyp'), JSON.stringify({
    targets: [
      {
	target_name: 'jsc',
	sources: ['jsc.cc'],
      },
    ],
  }));

  // Build library
  cp.execSync('../node_modules/.bin/node-gyp configure', { cwd: buildDirectory });
  cp.execSync('../node_modules/.bin/node-gyp build', { cwd: buildDirectory });

  // Create Node entrypoint
  fs.writeFileSync(path.join(buildDirectory, 'index.js'), 'require(\"./build/Release/jsc.node\").jsc_main();\n');
}
