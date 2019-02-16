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

  fs.writeFileSync(path.join(buildDirectory, 'lib.cc'), program);
  fs.writeFileSync(path.join(buildDirectory, 'binding.gyp'), JSON.stringify({
    targets: [
      {
	target_name: 'lib',
	sources: [path.join(buildDirectory, 'lib.cc')],
      },
    ],
  }));

  // Build library
  cp.execSync('node-gyp configure', { cwd: buildDirectory });
  cp.execSync('node-gyp build', { cwd: buildDirectory });

  // Create Node entrypoint
  fs.writeFileSync(path.join(buildDirectory, 'index.js'), 'require(\"./build/Release/lib.node\").jsc_main();\n');
}
