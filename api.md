# Webextensions logins API proposal

Andrew Swan (:aswan / aswan@mozilla.com)

## Background

The Firefox password manager stores usernames and passwords for websites so that a user does not need to memorize the variations on these that they have to use on dozens or hundreds of web sites.  An add-on SDK module is available that provides access to the password manager.  This module is commonly used by extensions that directly access sites for which a user has saved login credentials, allowing them to do so automatically without user intervention.  This document is a proposal for offering a similar API for webextensions.

The XPCOM object on which the password manager is built is nsILoginManager.  The relevant parts of that interfaces are pretty simple: basic CRUD operations on a collection of nsILoginInfo records.  For exposing login manager CRUD operations, the specific function signatures are not particularly interesting (a specific proposal is below), but how extension permissions apply to this API is worthy of some thought.

## Proposal

This section details a proposed webextensions API for accessing the login manager.  It is broken into a few high-level sections:

### Permissions

As with most existing webextension APIs, this API will have a new top-level permission, “logins”.  That is, the functions outlined below will not appear in an extension’s browser namespace unless the “logins” permission is included in the extension manifest.  In this way, a user who installs an extension that uses this API can be offered a prompt (either at install time or at use time, see https://github.com/mozilla/addons/issues/51 for that debate) with a message such as “This extension may access and modify your saved login and password information, do you want to proceed?”.

Using this permission to get access to this API is a good start, but the permissions system should ideally be much more fine-grained.  An extension that wants login credentials for a single site doesn’t need (and shouldn’t have) access to the full contents of the login manager database.  There are two legitimate reasons for a webextension to have access to a particular record: if the extension “owns” the record (i.e., the record was originally created by the extension) or if the extension has explicitly been granted access.

There are two types of records that are considered to be owned by a given extension, both distinguished by their hostname property.  One is a URL of the form `addon:id`, these are records created using the add-on SDK password library, as documented here (a record like this would be accessible to an SDK add-on that has been ported to a webextension).  The other is a URL of the form `moz-extension://id/` which is the appropriate form for records created by a webextension that apply to some extension-specific resource and not some external URL.

The question of explicitly granting an extension permission to access records maps nicely onto the webextensions concept of host permissions.  A host permission is a limited wildcard expression that is matched against URLs.  Host permissions are used by existing webextensions APIs to control things like whether an extension can inject a content script into a particular page or monitor HTTP requests to particular URLs.  The same checks will be applied to all login manager API requests.  To be specific, an extension is considered to have permission to access a record if the hostname property (explained in the following section) matches a host permission for the extension.

Putting these pieces together, the `search()` method will only return records that are owned by the running extension or to which the running extension has been explicitly granted access with a host permission.  Similarly, calls to the `store()` or `remove()` methods will only apply to records for which the running extension has access.  Calls to any of these methods that include an explicit hostname property that is not permitted will fail with a “permission denied” error.

### LoginInfo objects

The underlying XPCOM interface that represents an individual entry in the login/password database is nsILoginInfo.  Native nsLoginInfo instances will of course not be exposed directly to extensions, but these objects are accurately represented by simple javascript objects with the following properties, each of which is of type string (or null if not applicable):

Field name | Description
--- | ---
hostname | The hostname to which the login applies, formatted as a URL (for example, "http://www.site.com"). A port number (":123") may be appended.
formSubmitURL | The URL a form-based login was submitted to. For logins obtained from HTML forms, this field is the action attribute from the form element, with the path removed (for example, "http://www.site.com"). Forms with no action attribute default to submitting to their origin URL, so that is stored here. This field is null for logins attained from protocol authentications.
realm | The HTTP Realm for which the login was requested. When an HTTP server sends a 401 result, the WWW-Authenticate header includes a realm to identify the "protection space." See RFC 2617. If the result did not include a realm, or it was blank, the hostname is used instead. For logins obtained from HTML forms, this field is null.
username | The username for the login.
password | The password for the login.
usernameField | The name attribute for the username input in a form.
passwordField | The name attribute for the password input in a form.

### API methods

The methods provided by this API will be in the browser.logins namespace.  Note that, unlike nearly all other existing webextensions interfaces, this is a brand-new interface, so there is no need to includes these methods in the chrome namespace for compatibility.

The methods under browser.logins are:

Method Name | Description
--- | ---
`search(options)` | Search for saved logins/passwords.  The options parameter is a javascript object containing any of the properties from a LoginInfo object.  This method returns a promise that resolves to an array of LoginInfo objects, where each object in the array is both available to this extension as detailed in the Permissions section above, and matches all the properties passed in options.  This method does not perform any wildcard or range matching, it simply does literal matches on individual fields.  Note that if options is an empty object, then all records will trivially match so all records that match the extension’s host permissions will be returned.<br>Example use (inside an async Task):<br> ```let info = yield browser.logins.search({hostname: “https://www.youtube.com/”});```
`store(info)` | Store a new record in the login manager.  The info parameter must be a LoginInfo object as detailed in the above secion.  Returns a promise that resolves when the record has been stored (or rejects upon any error).
`remove(options)` | Remove existing records from the login manager.  The options parameter is treated just like in the `search()` method.  All matching records are removed from the login manager database (subject to the same permissions constraints as `search()`).  Returns a promise that resolves when all matching records have been removed (or rejects upon any error).


