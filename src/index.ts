import {
  stat,
  readFile,
} from 'fs/promises';

import path from 'path';

import minimist from 'minimist';

import babelParser from '@babel/parser';
import BT from '@babel/types';

export type Location = {
  line: number
  column: number
}

export type Transformation = {
  start: Location
  end: Location
  originalValue: string
  newValue: string
}

export const sortTransformations = (
  transformations: Transformation[],
): Transformation[] =>
  transformations.slice().sort((a, b) => {
    if (a.start.line < b.start.line) {
      return -1;
    }

    if (a.start.line > b.start.line) {
      return 1;
    }

    return a.start.column - b.start.column;
  });

const printUsage = () => {
  console.log('node index.js path/to/sourceFile.ts');
};

const bail = (errMessage: string, exitCode = 1): never => {
  console.log(`Error: ${errMessage}`);
  printUsage();
  process.exit(exitCode);
};

const fail = (node: BT.Node, msg = '') => {
  const additional = msg ? ` - ${msg}` : '';
  throw new Error(
    `Failed on node with type ${node.type}${additional}`,
  );
};

type SourceInfo = {
  filePath: string
}

const knownExtensions = [
  '.js', '.jsx', '.ts', '.tsx',
  '.cjs', '.mjs',
];

const hasKnownExtension = (str: string): boolean => {
  for (const ext of knownExtensions) {
    if (str.endsWith(`.${ext}`)) {
      return true;
    }
  }
  return false;
};

const transform = async (
  sourceCode: string,
  info: SourceInfo,
): Promise<Transformation[]> => {
  const transformations: Transformation[] = [];

  const AST = babelParser.parse(sourceCode, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
    ],
  });

  if (AST.type !== 'File') {
    fail(AST);
  }

  const { program } = AST;

  if (program.type !== 'Program') {
    fail(program);
  }

  const { body } = program;

  for (const node of body) {
    if (node.type === 'ImportDeclaration') {
      const { source } = node;

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

      if (importPath.startsWith('./')) {
        if (info.filePath.endsWith('.js')) {
          if (!hasKnownExtension(importPath)) {
            const importedFromDir = path.dirname(
              info.filePath,
            );

            const targetWithoutExt = path.join(
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
                return fail(source, 'unexpected quote type');
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
              });
            } catch (e) {
              if (e.code !== 'ENOENT') {
                throw e;
              }
              return fail(source, 'import target is not a file');
            }
          }
        }
      }
    }
  }

  return transformations;
};

const [inputFilePath] = minimist(process.argv.slice(2))._;

const processFile = async (filePath: string) => {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) {
      bail('Path does not point to a file.');
    }
  } catch (e) {
    bail('File does not exist.');
  }

  const buffer = await readFile(filePath);

  const sourceCode = buffer.toString();

  const transformations = await transform(sourceCode, {
    filePath,
  });

  const orderedTransformations = sortTransformations(
    transformations,
  );

  console.log(orderedTransformations);
};

await processFile(inputFilePath);
