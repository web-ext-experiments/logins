const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
const LoginInfo = Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
                                         "nsILoginInfo", "init");

const FIELDS = {
  formSubmitURL: "formSubmitURL",
  origin: "hostname",
  realm: "httpRealm",
  username: "username",
  password: "password",
  usernameField: "usernameField",
  passwordField: "passwordField",
};

function convert(info) {
  let obj = {};
  for (let field of Object.keys(FIELDS)) {
    obj[field] = info[FIELDS[field]];
  }
  return obj;
}

function match(info, search) {
  return Object.keys(search).every(field => search[field] == null || search[field] == info[FIELDS[field]]);
}

function accessible(context, origin) {
  let url;
  try {
    url = Services.io.newURI(origin, null, null);
  } catch (ex) {
    dump(`new uri failed ${ex.message}\n`);
    // unparseable hostname, can this actually happen?
    return false;
  }

  if (url.scheme == "addon") {
    return (url.path == context.extension.id);
  } else if (url.scheme == "moz-extension") {
    return (url.host == context.extension.id
            || url.host == context.extension.uuid);
  } else {
    return (context.extension.whiteListedHosts.matches(url));
  }
}

class API extends ExtensionAPI {
  getAPI(context) {
    // XXX only return this for background contexts?
    return {
      logins: {
        search(query) {
          let logins = Services.logins.getAllLogins()
              .filter(login => accessible(context, login.hostname))
              .filter(login => match(login, query))
              .map(convert);

          return Promise.resolve(logins);
        },

        store(info) {
          let origin = info.origin;

          function check(field) {
            if (!info[field]) {
              return;
            }
            let uri;
            try {
              uri = Services.io.newURI(info[field], null, null);
            } catch (err) {
              return Promise.reject({message: `Cannot parse ${field} as a URL`});
            }

            if (origin) {
              if (uri.prePath != origin) {
                return Promise.reject({message: `Origin does not match ${field}`});
              }
            } else {
              origin = uri.prePath;
            }
          }

          check("formSubmitURL");
          check("realm");

          if (!origin) {
            return Promise.reject({message: "Must specify origin, formSubmitURL, or realm"});
          }

          if (!accessible(context, origin)) {
            return Promise.reject({message: `Permission denied for ${origin}`});
          }

          let linfo = new LoginInfo(origin, info.formSubmitURL,
                                    info.realm, info.username, info.password,
                                    info.usernameField, info.passwordField);

          try {
            Services.logins.addLogin(linfo);
          } catch (err) {
            return Promise.reject({message: err.message});
          }
          return Promise.resolve();
        },

        remove(query) {
          try {
            Services.logins.getAllLogins()
              .filter(login => accessible(context, login.hostname))
              .filter(login => match(login, query))
              .forEach(login => { Services.logins.removeLogin(login); });
          } catch (err) {
            return Promise.reject({message: err.message});
          }
          return Promise.resolve();
        },
      },
    };
  }
}
