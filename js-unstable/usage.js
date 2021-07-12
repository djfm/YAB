export const usage = `
> node js/bin.js path/to/dir

# About

YAB (Yet Another Build tool) recursively watches
the contents of a directory containing ".js" files
and upon any file creation or modification it checks if
there are "import" statements where the URI of the
imported module is file missing the ".js" extension.

It simply adds the ".js" extension if the resulting file does
indeed exist.

# Why

Simply because TypeScript does not allow adding the ".ts"
extension in "import" statements when "type" is set to "module"
in 'package.json'.

Thus it doesn't change such imports at all.

Unfortunately "Node.js", when "type" is set to "module,
does not allow importing a file without its extension.

Thus, the resulting code cannot be executed bye "Node.js"
if you use "type" = "module.

YAB corrects this by adding the ".js" extension when it is
fairly confident you are indeed trying to import a file directly
and not a package.

Having YAB watch the "outDir" of a TypeScript project, in which you have
set "type": "module" in 'package.json' you can directly run
the JavaScript inside "outDir" with "Node.js" without any
module-loading issues, bundling or additional transpiling.

I think this is the minimal setup you can have to be as
close as possible to running pure TypeScript transpiled to ESNext
on Node.js.

# Usage

Just run the script "dist/bin.js" on a directory - the most
useful scenario is probably to run it in on the "outDir" of a
TypeScript's 'tsconfig.json' file.

Alternatively, pass the "--once" option to have the script return
as soon as it has done its job.
`.trim();
export default usage;
//# sourceMappingURL=usage.js.map