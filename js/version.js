// The one version number (R73). Settings shows it, the service worker names
// its cache after it (sw.js, so a bump here is what makes installed copies
// fetch the new files, R27, R30), and the guide at help/ says which version it
// describes. Bump it with any change to a file in sw.js's APP_SHELL;
// package.json carries the same number, and tests/unit/app-shell.test.js
// checks the two agree. The CI check (tools/check-version.js) fails a pull
// request that changes a cached file without changing this.
export const APP_VERSION = '1.0.56';
