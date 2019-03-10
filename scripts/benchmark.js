const cp = require('child_process');

const file = process.argv[2];
const times = +process.argv[3] || 1000;

let runAvg = 0;
let timingAvg = 0;

console.log('Running ' + times + ' benchmarks for ' + file);

for (let i = 0; i < times; i++) {
  if (i % 100 === 0) {
    console.log('Benchmarking...');
  }

  const start = new Date();
  const out = cp.execSync('node ' + file).toString();
  const end = new Date();

  runAvg += (end - start);

  const timing = +(out.split(': ')[1] || '').split('ms')[0];
  if (timing) {
    timingAvg += timing;
  }
}

console.log('Average run-time: ' + (runAvg / times) + 'ms');
console.log('Average console.time: ' + (timingAvg / times) + 'ms');
