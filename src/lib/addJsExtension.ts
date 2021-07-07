import path from 'path';
import { stat } from 'fs/promises';

import BT from '@babel/types';

import { Transformation } from './transformation';
import { FileMetaData } from './transformFile';

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
