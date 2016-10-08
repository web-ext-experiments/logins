"use strict";

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import("resource://testing-common/AddonTestUtils.jsm");
AddonTestUtils.createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "1");

function makeLoginInfo(data) {
  let info = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  for (let field of Object.keys(data)) {
    info[field] = data[field];
  }
  return info;
}

// record is a simple js object from the extension api, info is an nsILoginInfo
// accounts for field name differences
function checkRecord(record, info) {
  equal(record.formSubmitURL, info.formSubmitURL);
  equal(record.origin, info.hostname);
  equal(record.realm, info.httpRealm);
  equal(record.username, info.username);
  equal(record.password, info.password);
  equal(record.usernameField, info.usernameField);
  equal(record.passwordField, info.passwordField);
}

function loadApiExtension() {
  notEqual(_TEST_FILE, undefined, "_TEST_FILE is set");
  let testFile = new FileUtils.File(_TEST_FILE);
  equal(testFile.isSymlink(), true, "_TEST_FILE is a symlink");
  testFile = new FileUtils.File(testFile.target);
  // testFile.target should be this file, so its parent is the test
  // directory and parent.parent is the top level for the api extension
  let apiExtensionDir = testFile.parent.parent;
  do_print(`mapped test file ${_TEST_FILE} to api extension directory ${apiExtensionDir.path}\n`);

  return AddonManager.installTemporaryAddon(apiExtensionDir);
}

add_task(function* test_logins() {
  Services.prefs.setBoolPref("extensions.checkCompatibility.nightly", false);
  
  yield ExtensionTestUtils.startAddonManager();

  let apiExtension = yield loadApiExtension();

  function background() {
    browser.test.onMessage.addListener(function(msg, args) {
      let match = msg.match(/^(\w+)\.request$/);
      if (!match) {
        return;
      }
      let cmd = match[1];
      Promise.resolve().then(() => browser.logins[cmd](...args))
        .then(results => {
          browser.test.sendMessage(`${cmd}.done`, {results});
        }, err => {
          browser.test.sendMessage(`${cmd}.done`, {errmsg: err.message});
        });
    });
    browser.test.sendMessage("ready");
  }

  function run(ext, cmd, ...args) {
    let promise = ext.awaitMessage(`${cmd}.done`);
    ext.sendMessage(`${cmd}.request`, args);
    return promise;
  }

  let privilegedExtension = ExtensionTestUtils.loadExtension({
    background,
    manifest: {
      permissions: ["experiments.logins", "logins", "<all_urls>"],
    },
  });

  let unprivilegedExtension = ExtensionTestUtils.loadExtension({
    background,
    manifest: {
      permissions: ["experiments.logins", "logins"],
    },
  });

  yield privilegedExtension.startup();
  yield unprivilegedExtension.startup();
  yield privilegedExtension.awaitMessage("ready");
  yield unprivilegedExtension.awaitMessage("ready");

  // Initially, we shouldn't see anything
  let response = yield run(privilegedExtension, "search", {});
  equal(response.results.length, 0);
  response = yield run(unprivilegedExtension, "search", {});
  equal(response.results.length, 0);

  // Add one login record
  let record = {
    formSubmitURL: "https://test.mozilla.com/testpage",
    hostname: "https://test.mozilla.com/",
    username: "user",
    password: "password",
    usernameField: "usernameField",
    passwordField: "passwordField",
  };
  let info = makeLoginInfo(record);
  Services.logins.addLogin(info);

  // The unprivileged extension should not be able to see it
  response = yield run(unprivilegedExtension, "search", {});
  equal(response.results.length, 0);

  // The privileged extension should be able to see it
  response = yield run(privilegedExtension, "search", {});
  equal(response.results.length, 1);
  checkRecord(response.results[0], info);

  // And it should see it with a targeted search too
  response = yield run(privilegedExtension, "search", {username: "user"});
  equal(response.results.length, 1);
  checkRecord(response.results[0], info);

  // But with non-matching search terms we should not see it
  response = yield run(privilegedExtension, "search", {username: "somebodyelse"});
  equal(response.results.length, 0);

  // XXX test search() on other fields, combinations

  let record2 = {
    formSubmitURL: "https://test2.mozilla.com/somepage",
    origin: "https://test2.mozilla.com",
    realm: null,
    username: "joe",
    password: "joes sekrit password",
    usernameField: "username",
    passwordField: "password",
  };

  // Test that unprivileged extension cannot store a record for an external site
  response = yield run(unprivilegedExtension, "store", record2);
  equal(`Permission denied for ${record2.origin}`, response.errmsg,
        "Trying to store an invalid record generated a good error");

  // Test that store() works for an extension with permission
  response = yield run(privilegedExtension, "store", record2);
  equal(response.errmsg, undefined, "store() succeeded");

  // Now we should be able to see it with search()
  let query = {origin: record2.origin};
  response = yield run(privilegedExtension, "search", query);
  equal(response.results.length, 1, "search() found 1 record");
  deepEqual(record2, response.results[0], "record retrieved from search() matches the inserted record");

  // Unprivileged extension should not be able to remove the record
  response = yield run(unprivilegedExtension, "remove", query);
  equal(response.errmsg, undefined, "remove() succeeded");
  response = yield run(privilegedExtension, "search", query);
  equal(response.results.length, 1, "search() after unprivileged remove found 1 records");

  // Extension with privileges should be able to remove it
  response = yield run(privilegedExtension, "remove", query);
  equal(response.errmsg, undefined, "remove() succeeded");
  response = yield run(privilegedExtension, "search", query);
  equal(response.results.length, 0, "search() after privileged remove found 0 records");

  yield privilegedExtension.unload();
  yield unprivilegedExtension.unload();
  apiExtension.uninstall();
});
