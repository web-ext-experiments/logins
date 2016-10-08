
## Webextension login API extension

This project contains the implementation of the Firefox
browser.logins API.
See https://bugzilla.mozilla.org/show_bug.cgi?id=1285270 for more details.

### Running tests

This is a hack while we work out a smoother process but for now:

1. From a mozilla-central source tree, create a symlink for
   [`tests/test_login.js`](tests/test_login.js) in the webextensions
   xpcshell directory with the command:

   ```sh
   ln -s (path/to/this/repo)/tests/test_ext_logins.js toolkit/components/extensions/test/xpcshell
   ```

2. Add the following line to `toolkit/components/extensions/test/xpcshell/xpcshell.ini`:

   ```
   [test_ext_logins.js]
   ```

3. Re-build the test database
   (`./mach build` or your favorite more targetted variant)

4. Run the test:

   ```
   ./mach test toolkit/components/extensions/test/xpcshell/test_ext_logins.js
   ```
