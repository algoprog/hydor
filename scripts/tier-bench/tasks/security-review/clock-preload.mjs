// Loaded into the service under test with --import. It moves the service's clock forward by the number of
// milliseconds written in the file named by CHECK_CLOCK_FILE, so the checker can travel days ahead in a moment.
import fs from 'node:fs';

const RealDate = Date;
const file = process.env.CHECK_CLOCK_FILE;

function offset() {
  try {
    return Number(fs.readFileSync(file, 'utf8')) || 0;
  } catch {
    return 0;
  }
}

function FakeDate(...args) {
  if (!new.target) return new RealDate(RealDate.now() + offset()).toString();
  return args.length === 0 ? new RealDate(RealDate.now() + offset()) : new RealDate(...args);
}
FakeDate.prototype = RealDate.prototype;
FakeDate.now = () => RealDate.now() + offset();
FakeDate.parse = RealDate.parse;
FakeDate.UTC = RealDate.UTC;
if (file) globalThis.Date = FakeDate;
