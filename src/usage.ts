export const usage = `
> node js/bin.js path/to/dir

# About

YAB (Yet Another Build tool) recursively watches
the contents of a directory containing ".js" files
and upon any file creation or modification it checks if
there are "import" statements where the URI of the
imported module is a local file, belonging to the watched folder,
and not in node_modules.

It simply adds the ".js" extension if the resulting file does
indeed exist.

# Why

Having YAB watch the "outDir" of a TypeScript project, you can
directly run the JavaScript inside "outDir" with node without any
module-loading issues, bundling or additional transpiling.

I think this is the minimal setup you can have to be as
close as possible to running pure TypeScript transpiled to ESNext
on Node.js.`.trim();

export default usage;
