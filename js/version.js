// The app's version number (R73). Settings shows it and the guide at help/
// says which version it describes. The same number is written in sw.js (the
// cache name, which is what makes installed copies fetch new files, R27,
// R30) and package.json. Bump all three with one command:
//
//   npm run bump 1.0.57
//
// tests/unit/app-shell.test.js fails when the copies differ, and
// tools/check-version.js (run by CI on every pull request) fails a change to
// a cached file that leaves this file alone.
export const APP_VERSION = '1.0.59';
