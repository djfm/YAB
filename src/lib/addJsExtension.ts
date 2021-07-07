import path from 'path';
import { stat } from 'fs/promises';

import BT from '@babel/types';

import { Transformation } from './transformation';
import { FileMetaData } from './transformFile';

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

const knownExtensions = [
  'js', 'jsx', 'ts', 'tsx',
  'cjs', 'mjs',
];

const hasKnownExtension = (str: string): boolean => {
  for (const ext of knownExtensions) {
    if (str.endsWith(`.${ext}`)) {
      return true;
    }
  }
  return false;
};

const fail = (node: BT.Node, ...msgParts: string[]): never => {
  const msgLines = msgParts.length === 0 ? [
    'An unspecified error occurred.',
  ] : msgParts;

  msgLines.push(
    `Nearest related AST Node has type ${node.type}.`,
  );

  throw new Error(
    msgParts.join('\n'),
  );
};

export const addJsExtension = async (
  programBody: BT.Statement[],
  metaData: FileMetaData,

): Promise<[Transformation[], FileMetaData]> => {
  const transformations: Transformation[] = [];
  const fileMetaData: FileMetaData = { ...metaData };

  for (const stmt of programBody) {
    if (stmt.trailingComments) {
      const { trailingComments } = stmt;
      for (const comment of trailingComments) {
        if (comment.loc.start.line === comment.loc.end.line) {
          const [, maybeSourceMappingURL] = comment.value.split(
            'sourceMappingURL=',
          );
          if (maybeSourceMappingURL) {
            fileMetaData.sourceMappingURL = maybeSourceMappingURL;
          }
        }
      }
    }

    if (stmt.type === 'ImportDeclaration') {
      const { source } = stmt;

      if (source.type !== 'StringLiteral') {
        fail(source);
      }

      if (source.loc === null) {
        return fail(source, 'missing "loc"');
      }

      if (!source.extra) {
        return fail(source, 'missing "extra"');
      }

      const { start, end } = source.loc;

      const {
        value: importPath,
        extra: { raw },
      } = source;

      if (!raw) {
        return fail(source, 'no value for "extra.raw"');
      }

      if (typeof raw !== 'string') {
        return fail(source, '"extra.raw" is not a string');
      }

      // TODO handle 'file:///' specifiers
      if (importPath.startsWith('./') || path.isAbsolute(importPath)) {
        // relative imports - yes I know a path starting with '/'
        // is actually absolute, but they are treated the same by Node's
        // resolution algorithm

        if (metaData.pathname.endsWith('.js')) {
          if (!hasKnownExtension(importPath)) {
            const importedFromDir = path.dirname(
              metaData.pathname,
            );

            const targetWithoutExt = path.isAbsolute(importPath)
              ? importPath
              : path.join(
                  importedFromDir,
                  importPath,
                );

            const importTarget = `${targetWithoutExt}.js`;

            try {
              // eslint-disable-next-line no-await-in-loop
              const s = await stat(importTarget);
              if (!s.isFile()) {
                return fail(source, 'expected a file');
              }
              const quote = raw[0];

              if (!['"', "'", '`'].includes(quote)) {
                fail(source, 'unexpected quote type');
              }

              transformations.push({
                start,
                end,
                originalValue: raw,
                newValue: [
                  quote,
                  importPath,
                  '.js',
                  quote,
                ].join(''),
                metaData: {
                  type: 'js-import-extension',
                },
              });
            } catch (e) {
              if (e.code !== 'ENOENT') {
                throw e;
              }
              // well that's OK, sometimes the file
              // is not there, maybe it hasn't finished
              // compiling yet
            }
          }
        }
      }
    }
  }

  return [transformations, fileMetaData];
};

export default addJsExtension;
