import { stat, readFile, writeFile, } from 'fs/promises';
import path from 'path';
import { URL } from 'url';
import minimist from 'minimist';
import chokidar from 'chokidar';
import { postpone, } from './lib/util.js';
import { applyTransformations, transform, } from './lib/transformation.js';
const metaURLString = import.meta.url;
const { pathname: thisScriptPathname, } = new URL(metaURLString);
const log = (...args) => {
    // eslint-disable-next-line no-console
    console.log(...args);
};
/** will be improved later */
log.info = log;
log.warning = log;
log.error = log;
const printUsage = () => {
    const usage = `
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
on Node.js.
`;
    log(usage.trim());
};
const bail = (errMessage, exitCode = 1) => {
    log(`\n>> Error: ${errMessage}\n`);
    printUsage();
    process.exit(exitCode);
};
const [inputPathArgument] = minimist(process.argv.slice(2))._;
if (!inputPathArgument) {
    bail('Please provide a path to a directory to watch.');
}
// TODO update the source-maps
const processFile = async (filePath, options) => {
    if (!options?.assumePathAndTypeValid) {
        try {
            const s = await stat(filePath);
            if (!s.isFile()) {
                bail('Path does not point to a file.');
            }
        }
        catch (e) {
            if (e.code !== 'ENOENT') {
                bail(`Unexpected error ${e.code}`);
            }
            bail('File does not exist.');
        }
    }
    const buffer = await readFile(filePath);
    const sourceCode = buffer.toString();
    const [transformations] = await transform(sourceCode, {
        filePath,
    });
    const nt = transformations.length;
    if (nt > 0) {
        const transformedSource = applyTransformations(transformations, sourceCode);
        await writeFile(filePath, transformedSource);
        const details = transformations.map((t) => `    ${t?.metaData?.type} ${t.originalValue} => ${t.newValue}`);
        log.info([
            `performed ${nt} transformation${nt !== 1 ? 's' : ''} in "${filePath}":`,
            ...details,
        ].join('\n'));
    }
    return nt;
};
const isPathBlacklisted = (filePath) => {
    if (/\bnode_modules\b/.test(filePath)) {
        return true;
    }
    return false;
};
const startWatching = async (dirPath) => {
    try {
        const s = await stat(dirPath);
        if (!s.isDirectory()) {
            bail('Path does not point to a directory.');
        }
    }
    catch (e) {
        if (e.code !== 'ENOENT') {
            bail(`Unexpected error ${e.code}`);
        }
        bail('Directory does not exist.');
    }
    log.info(`started watching directory ${dirPath}`);
    let nDirs = 0;
    let nFiles = 0;
    let nProcessable = 0;
    const report = postpone(500)(() => log(`watching ${nDirs} directories totalling ${nFiles} files, of which ${nProcessable} are of interest to us`));
    const isProcessable = (p) => p.endsWith('.js')
        && !isPathBlacklisted(p);
    chokidar.watch(dirPath).on('all', (event, eventPath) => {
        if (event === 'add') {
            nFiles += 1;
            if (isProcessable(eventPath)) {
                nProcessable += 1;
                report();
            }
        }
        if (event === 'addDir') {
            nDirs += 1;
            report();
        }
        if (event === 'unlink') {
            nFiles -= 1;
            if (isProcessable(eventPath)) {
                nProcessable -= 1;
                report();
            }
        }
        if (event === 'unlinkDir') {
            nDirs -= 1;
            report();
        }
        if (event === 'add' || event === 'change') {
            if (isProcessable(eventPath)) {
                processFile(eventPath, {
                    assumePathAndTypeValid: true,
                });
                if (path.resolve(eventPath) === thisScriptPathname) {
                    log.info('[YAB is watching its own transpilation directory]');
                }
            }
        }
    });
};
startWatching(inputPathArgument);
//# sourceMappingURL=bin.js.map