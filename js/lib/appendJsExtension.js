import path from 'path';
import { readFile, } from 'fs/promises';
import traverse from './traverse.js';
import { hasOwnProperty, statOrUndefined, } from './util.js';
/**
 * Node's resolution algorithm for "import" statements is
 * described here: https://nodejs.org/api/esm.html#esm_resolution_algorithm
 *
 * To sum it up, there are 3 kinds of specifiers (the thing you import):
 *
 *  - relative: './startup.js' or '../config.mjs'
 *    (and if I understand correctly "/root/module.js"
 *
 *  - bare: 'some-package' or 'some-package/shuffle'
 *    Like in CommonJS, module files within packages can be accessed by appending a
 *    path to the package name unless the package’s package.json contains an "exports" field,
 *    in which case files within packages can only be accessed via the paths defined in "exports".
 *
 *  - absolute: 'file:///opt/nodejs/config.js'
 *
 * Node resolves relative and bare specifiers the same way, that is, just following
 * the URL spec (https://url.spec.whatwg.org/) to load the resource.
 *
 * The most important things to note from the resolution algorithm are:
 *
 * For relative specifiers the algorithm states ("URL resolution"):
 * ================================================================
 *
 *    - "No default extensions"
 *
 *    - "If the file at resolved is a directory, then Throw an Unsupported Directory Import error."
 *
 *    - "If the file at resolved does not exist, then Throw a Module Not Found error.""
 *
 *    This means that if you write: import './file', Node won't try to load './file.js' like
 *    it would have with require() - either './file' is an actual file and Node will throw
 *    an 'ERR_UNKNOWN_FILE_EXTENSION' error, or it is a directory, and since we are resolving
 *    a relative specifier, the algorithm stops here
 *    and Node will throw an 'ERR_UNSUPPORTED_DIR_IMPORT' error.
 *
 *  For bare specifiers (a.k.a. packages):
 *  ======================================
 *
 *    The algorithm is much more complex. Following is what I take away from
 *    from reading the spec that may be useful for this program.
 *
 *    General principle
 *    -----------------
 *
 *      Like before, the algorithm looks at the 'node_modules' folders in the
 *      parent hierarchy of the module performing the 'import', including of
 *      course the folder of the importing module, and stops at the first
 *      'node_modules' directory that it finds.
 *
 *      e.g. if a module '/a/b/c/alice.js' does an "import 'bob'"
 *      then Node will check the existence of:
 *      - /a/b/c/node_modules/bob
 *      - /a/b/node_modules/bob
 *      - /a/node_modules/bob
 *      - /node_modules/bob
 *      and this step of the algorithm stops at the first folder found
 *
 *    A few definitions
 *    -----------------
 *
 *      - The << package name >> is either the full specifier, or the part until the
 *        first "/" if there is one,
 *        except if the specifier starts with an "@", in which case it also needs
 *        to contain a slash ("/") and the package name is then defined as
 *        what comes after the first "/"
 *        until either the end of the string or the next "/" like for regular
 *        package specifiers
 *        e.g. "@types/babel" has "babel" as package name, "@a/b/c" is named "b"
 *
 *      - Then Node defines the << package sub-path >> as:
 *        "." + specifier.slice(packageName.length),
 *        i.e. "." concatenated with the part of the specifier that comes after
 *        the package name if there is one, e.g. "./promises" for "fs/promises",
 *        or "./safe" in the case of "colors/safe" (which is the package that led me down
 *        this rabbit hole of reading the full spec because I cannot do
 *        "import colors from 'colors/safe'" - it throws an 'ERR_MODULE_NOT_FOUND')
 *
 *    The algorithm as I understand it
 *    --------------------------------
 *
 *    Once Node has found a suitable folder in a 'node_modules' folder,
 *    it first checks if it contains a 'package.json' file.
 *
 *    If there is no 'package.json' the module is loaded as a directory,
 *    using the legacy algorithm. I don't know how this works and I don't
 *    think it's very relevant for my use case.
 *
 *    If the 'package.json' file is invalid then an error is thrown.
 *
 *    If the 'package.json' has an "exports" key, there is a messed-up
 *    algorithm describing how to map the package sub-path to an actual
 *    file.
 *
 *    Thankfully Webpack describes it in an easy to understand way:
 *    https://webpack.js.org/guides/package-exports/
 *
 *    If there is no "exports" key in the 'package.json', then the module
 *    is resolved using the standard URL resolution algorithm with
 *    the sub-path as URL and the package's folder as the current directory.
 *
 *
 * CONCLUSION:
 *
 *  - My problematic "colors/safe" module that I cannot "import" has no "exports"
 *    key in its package.json, so Node will treat it as
 *    a relative import (relative to the module's resolved root folder), so my program
 *    needs to append a ".js" in this case too.
 */
const findPackageDirectory = async (directoryOfImportingFile, packageName) => {
    const candidate = path.join(directoryOfImportingFile, 'node_modules', packageName);
    const s = await statOrUndefined(candidate);
    if (s) {
        return candidate;
    }
    const parent = path.dirname(directoryOfImportingFile);
    if (parent === directoryOfImportingFile) {
        // we've reached the root of the filesystem
        return undefined;
    }
    return findPackageDirectory(parent, packageName);
};
const loadPackageDotJSON = async (packageDirectory) => {
    try {
        const buffer = await readFile(path.join(packageDirectory, 'package.json'));
        const jsonSource = buffer.toString();
        try {
            return JSON.parse(jsonSource);
        }
        catch (e) {
            return 'invalid';
        }
    }
    catch (e) {
        return undefined;
    }
};
/**
 * Determines if we should append the ".js" extension
 * to a given "import" statement.
 *
 * The guiding principle is to only do it when we are sure
 * that the JS source code wouldn't work otherwise,
 * and that our replacement is valid.
 *
 * @param importingFilePathname is the file in which the
 *                              "import" statement was found
 *
 * @param importSpecifier       is what that "import" statement
 *                              is trying to import
 */
export const shouldAppendJsExtension = async (importingFilePathname, importSpecifier) => {
    if (!importingFilePathname.endsWith('.js')) {
        return false;
    }
    const importSpecifierParts = importSpecifier.split('/');
    if (importSpecifierParts[importSpecifierParts.length - 1]
        .includes('.')) {
        // there may be an extension specified,
        // so we won't touch the import
        return false;
    }
    const importingFileDirectory = path.dirname(importingFilePathname);
    // TODO handle 'file:///' specifiers
    if (importSpecifier.startsWith('./')
        || importSpecifier.startsWith('../')
        || path.isAbsolute(importSpecifier)) {
        // relative imports - yes I know a path starting with '/'
        // is actually absolute, but they are treated the same by Node's
        // resolution algorithm
        const resolvedSpecifierWithoutExt = path.isAbsolute(importSpecifier) ? importSpecifier
            : path.join(importingFileDirectory, importSpecifier);
        const resolvedSpecifierPathname = `${resolvedSpecifierWithoutExt}.js`;
        const specifierStat = await statOrUndefined(resolvedSpecifierPathname);
        if (specifierStat !== undefined) {
            return specifierStat.isFile();
        }
    }
    else if (/^\w/.test(importSpecifier)) {
        if (importSpecifier.includes('/')) {
            // we are importing a sub-path, so this
            // is more or less the same case as above,
            // except that the original import statement
            // has a chance to work **if** the target module
            // has an "exports" key in its 'package.json'
            // that has an entry for our importSpecifier's sub-path.
            const [packageName, ...subPathParts] = importSpecifierParts;
            const subPath = ['.', ...subPathParts].join('/');
            // eslint-disable-next-line no-await-in-loop
            const packageDirectory = await findPackageDirectory(importingFileDirectory, packageName);
            if (!packageDirectory) {
                return false;
            }
            const pjson = await loadPackageDotJSON(packageDirectory);
            if (pjson !== undefined
                && pjson !== 'invalid'
                && hasOwnProperty(pjson, 'exports')) {
                // if "exports" is defined it's a bad idea to rewrite
                // the specifier because either:
                // - there is a mapping in "exports" for our subPath
                // - or there is none, in which case the import is illegal
                //   so returning true would clearly break the spec
                return false;
            }
            const resolvedSpecifierPathname = `${path.join(packageDirectory, subPath)}.js`;
            const specifierStat = await statOrUndefined(resolvedSpecifierPathname);
            if (specifierStat !== undefined) {
                return specifierStat.isFile();
            }
        }
    }
    return false;
};
export const appendJsExtension = async (ast, metaData) => {
    const transformations = [];
    const fileMetaData = { ...metaData };
    const potentialReplacements = [];
    traverse(ast, {
        enter: (nodePath) => {
            if (nodePath.isImportDeclaration()) {
                const { node: { source } } = nodePath;
                if (source.type === 'StringLiteral') {
                    if (source.loc && source.extra) {
                        const { value: specifier, extra: { raw }, } = source;
                        if (!raw) {
                            return;
                        }
                        if (typeof raw !== 'string') {
                            return;
                        }
                        const { start, end } = source.loc;
                        const quoteCharacter = raw[0];
                        if (!['"', "'"].includes(quoteCharacter)) {
                            return;
                        }
                        potentialReplacements.push({
                            start,
                            end,
                            originalValue: raw,
                            quoteCharacter,
                            specifier,
                        });
                        // eslint-disable-next-line no-await-in-loop
                    }
                }
            }
        },
    });
    await Promise.all(potentialReplacements.map(async ({ start, end, originalValue, quoteCharacter, specifier, }) => {
        const shouldAppendExt = await shouldAppendJsExtension(metaData.pathname, specifier);
        if (shouldAppendExt) {
            transformations.push({
                start,
                end,
                originalValue,
                newValue: [
                    quoteCharacter,
                    specifier,
                    '.js',
                    quoteCharacter,
                ].join(''),
                metaData: {
                    type: 'js-import-extension',
                },
            });
        }
    }));
    return [transformations, fileMetaData];
};
export default appendJsExtension;
//# sourceMappingURL=appendJsExtension.js.map