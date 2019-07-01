## Openfin Service Config

A helper module which contains the Store component and all associated logic.  The store is the default export and individual components are accessible with slash notation.  For example  `openfin-service-config/Watch`.

#### Plugins
This module also includes two Webpack plugins. Each plugin is available via the slash notation.

* `SchemaToDefaultsPlugin`: Generate a static JSON file that contains the default value of every input schema.
* `SchemaToTypeScriptPlugin`: Generates TypeScript code from one or more JSON schema files.