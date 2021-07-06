import {
  stat,
  readFile,
  writeFile,
} from 'fs/promises';

import path from 'path';

import minimist from 'minimist';

import babelParser from '@babel/parser';
import BT from '@babel/types';

import chokidar from 'chokidar';

type voidReturningFunction = (
  ...args: unknown[]
) => void;
const nospam = (nMilliseconds: number) =>
  (fn: voidReturningFunction): voidReturningFunction => {
    let lastCallTime = 0;
    let currentTimeout: ReturnType<typeof setTimeout> | undefined;

    const wrappedFn = (...args: unknown[]) => {
      const tooEarly = () =>
        (Date.now() - lastCallTime) < nMilliseconds;

      const scheduleCall = () => {
        if (currentTimeout) {
          clearTimeout(currentTimeout);
        }

        currentTimeout = setTimeout(
          () => wrappedFn(...args),
          nMilliseconds,
        );
      };

      if (tooEarly()) {
        scheduleCall();
      } else {
        lastCallTime = Date.now();
        fn(...args);
      }
    };

    return wrappedFn;
  };

export type Location = {
  line: number
  column: number
}

export type Transformation = {
  start: Location
  end: Location
  originalValue: string
  newValue: string
  metaData?: Record<string, unknown>
}

export type SortedTransformationsArray = Readonly<Transformation[]>

export const sortTransformations = (
  transformations: Transformation[],
): SortedTransformationsArray =>
  transformations.slice().sort((a, b) => {
    if (a.start.line < b.start.line) {
      return -1;
    }

    if (a.start.line > b.start.line) {
      return 1;
    }

    return a.start.column - b.start.column;
  });

const log = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log(...args);
};

/** will be improved later */
log.info = log;
log.warning = log;
log.error = log;

const printUsage = () => {
  const usage = `
YAB welcomes you. YAB is Yet Another Build tool.

# Usage:
========

> YAB_RUN={X} node js/index.js {some/path}
          ***                  ***********

The default action is:
----------------------

> to try and recover from the file-extension
> mess of TypeScript imports
> when using "type": "module" in package.json
> and "module": "ESNext" in tsconfig.json, that is,
> simply put, just adding ".js" to relative imports
> where it makes sense

and it requires **no setup**

# There are TWO ways of invoking the YAB program:
=================================================

let me repeat the command:

>   YAB_RUN={X} node js/index.js {some/path}
            ***                  ***********

    ##1.)  with {X} === watch and {some/path} pointing to a directory
    =====       ***     *****     ***********               *********

                          containing ".js" files
                          (typically the "compilerOptions.outDir"
                          of a "tsconfig.json")

          then

              the default action will be performed on all the
              ".js" files in the provided directory, and the
              files will be watched for changes, so that
              whenever TypeScript emits some new absurdity,
              YAB will attempt to correct it


    ##2.) with {X} === 1 and {some/path} pointing to a ".js" file
    =====      ***           ***********                ****

         then

              the default action  will be performed on that file
              (it can be useful for testing / debugging)

I hope this tool solves more issues than it creates.

Sincerely yours,
djfm.
`;
  log(usage.trim());
};

const bail = (errMessage: string, exitCode = 1): never => {
  log(`\n>> Error: ${errMessage}\n`);
  printUsage();
  process.exit(exitCode);
};

const fail = (node: BT.Node, ...msgParts: string[]) => {
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

type SourceInfo = {
  filePath: string
}

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

type FileMetaData = {
  sourceMappingURL?: string
}

const transform = async (
  sourceCode: string,
  info: SourceInfo,
): Promise<[Transformation[], FileMetaData]> => {
  const transformations: Transformation[] = [];
  const metaData: FileMetaData = {};

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
    if (node.trailingComments) {
      const { trailingComments } = node;
      for (const comment of trailingComments) {
        if (comment.loc.start.line === comment.loc.end.line) {
          const [, maybeSourceMappingURL] = comment.value.split(
            'sourceMappingURL=',
          );
          if (maybeSourceMappingURL) {
            metaData.sourceMappingURL = maybeSourceMappingURL;
          }
        }
      }
    }

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

  return [transformations, metaData];
};

const [inputPathArgument] = minimist(process.argv.slice(2))._;

type OriginalToTransformedConverter = (
  originalLocation: Location
) => Location

type TransformationResult = {
  sourceLines: string[]
  convertToTransformed: OriginalToTransformedConverter
}

// TODO this method **WILL NOT** work
// for transformations either spanning
// several source lines,
// or replacing one line with several lines
const applySingleTransformation = (
  transformation: Transformation,
  sourceLines: string[],
  convertToTransformed: OriginalToTransformedConverter,
): TransformationResult => {
  const convertedStart = convertToTransformed(
    transformation.start,
  );

  const convertedEnd = convertToTransformed(
    transformation.end,
  );

  const isSourceMultiLine = convertedStart.line
    < convertedEnd.line;

  if (sourceLines.length < convertedStart.line) {
    throw new Error(
      'transformation cannot be applied - not enough input lines',
    );
  }

  // lines before our target that are sure
  // to remain unchanged
  const linesBefore = sourceLines.slice(
    0,
    convertedStart.line - 1,
  );

  // lines that we will change, totally or partially
  const linesToModify = sourceLines.slice(
    convertedStart.line - 1,
    convertedEnd.line,
  );

  // lines after our target that are sure
  // to remain unchanged
  const linesAfter = sourceLines.slice(
    convertedEnd.line,
  );

  // the part in the first modified line that we won't transform
  const leftPartOfFirstModifiedLine = linesToModify[0]
    .slice(0, convertedStart.column);

  // the part in the first modified line that we will transform
  const rightPartOfFirstModifiedLine = linesToModify[0]
    .slice(
      convertedStart.column,
      isSourceMultiLine ? undefined : convertedEnd.column,
    );

  // the part in the last modified line that we will transform
  // it's empty in the single line case because we have it captured
  // in the rightPartOfFirstModifiedLine already
  const leftPartOfLastModifiedLine = isSourceMultiLine
    ? linesToModify[linesToModify.length - 1]
      .slice(0, convertedEnd.column)
    : '';

  // the part in the last modified line that we won't transform
  // works for both single and multi-line transformations
  const rightPartOfLastModifiedLined = linesToModify[
    linesToModify.length - 1
  ].slice(convertedEnd.column);

  const source = [
    // half of the first modified line
    rightPartOfFirstModifiedLine,

    // the full lines that are neither the first line
    // to be modified nor the last one
    // - will be an empty list in the single line case
    ...linesToModify.slice(1, -1),

    // half of the last of the modified line
    // - set to the empty string in the multi-line case
    leftPartOfLastModifiedLine,
  ].join('');

  if (source !== transformation.originalValue) {
    throw new Error(
      `did not find expected source string - got "${
        source
      }" instead of ${
        transformation.originalValue
      }`,
    );
  }

  const newModifiedLines = [
    // the part of the first affected line that
    // we did not alter
    leftPartOfFirstModifiedLine,

    // the replacement value that was specified
    transformation.newValue,

    // the part of the last affected line
    // that we did not alter
    rightPartOfLastModifiedLined,
  ].join('').split('\n');

  const newSourceLines = [
    ...linesBefore,
    ...newModifiedLines,
    ...linesAfter,
  ];

  // TODO won't work in a ton of cases,
  // this is just a proof of concept and
  // a draft
  const newConverter = (loc: Location) => {
    // we would return baseLoc if we hadn't changed
    // anything
    const baseLoc = convertToTransformed(loc);

    // the adjustment factor to apply to baseLoc.line
    // if we need to - but we don't necessarily need to,
    // depending on whether the target of baseLoc was
    // affected by our operation
    const deltaLines = newModifiedLines.length
      - linesToModify.length;

    if (baseLoc.line > convertedEnd.line) {
      // we just need to offset the line,
      // the column couldn't have changed

      return {
        line: baseLoc.line + deltaLines,
        column: baseLoc.column,
      };
    }

    // the default is to assume the coordinates
    // haven't changed
    return baseLoc;
  };

  return {
    sourceLines: newSourceLines,
    convertToTransformed: newConverter,
  };
};

const recursivelyApplyTransformations = (
  transformations: readonly Transformation[],
  previousResult: TransformationResult,
): TransformationResult => {
  if (transformations.length === 0) {
    return previousResult;
  }

  const [t, ...remainingTransformations] = transformations;

  const newResult = applySingleTransformation(
    t,
    previousResult.sourceLines,
    previousResult.convertToTransformed,
  );

  return recursivelyApplyTransformations(
    remainingTransformations,
    newResult,
  );
};

/**
 * Checks whether there are overlapping transformations
 * within the provided array.
 *
 * As indicated by the parameter type, the function
 * assumes that the transformations have already been
 * sorted (with sortTransformations).
 */
const transformationsOverlap = (
  sortedTransformations: SortedTransformationsArray,
): boolean => {
  // eslint-disable-next-line no-labels
  outerLoop: for (let i = 0; i < sortedTransformations.length - 1; i += 1) {
    for (let j = i + 1; j < sortedTransformations.length; j += 1) {
      const fst = sortedTransformations[i];
      const snd = sortedTransformations[j];

      if (fst.end.line < snd.start.line) {
        /**
         * represents a situation like this:
         *
         * FFF
         * FFF
         *
         * SSS
         * SSS
         *
         * works because transformations are ordered
         * primarily by ascending start line
         */

        // eslint-disable-next-line no-continue,no-labels
        continue outerLoop;
      }

      if (fst.end.line > snd.start.line) {
        // this one is obvious
        return true;
      }

      if (fst.end.line === snd.start.line) {
        /**
         * the situation is like:
         *
         * FFF
         * F?S
         * SSS
         */

        if (fst.end.column < snd.start.column) {
          // eslint-disable-next-line no-continue,no-labels
          continue outerLoop;
        }

        // overlap
        return true;
      }
    }
  }

  return false;
};

export const applyTransformations = (
  unorderedTransformations: Transformation[],
  sourceCode: string,
): string => {
  const transformations = sortTransformations(
    unorderedTransformations,
  );

  if (transformationsOverlap(transformations)) {
    throw new Error('overlapping transformations cannot be applied');
  }

  const sourceLines = sourceCode.split('\n');

  const initialState: TransformationResult = {
    sourceLines,
    convertToTransformed: (loc: Location) => loc,
  };

  const result = recursivelyApplyTransformations(
    transformations,
    initialState,
  );

  return result.sourceLines.join('\n');
};

type ProcessFileOptions = {
  assumePathAndTypeValid?: boolean
}

const processFile = async (
  filePath: string,
  options?: ProcessFileOptions,
): Promise<number> => {
  if (!options?.assumePathAndTypeValid) {
    try {
      const s = await stat(filePath);
      if (!s.isFile()) {
        bail('Path does not point to a file.');
      }
    } catch (e) {
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
    const transformedSource = applyTransformations(
      transformations,
      sourceCode,
    );

    await writeFile(filePath, transformedSource);

    const details = transformations.map(
      (t: Transformation) =>
        `    ${
          t?.metaData?.type
        } ${
          t.originalValue
        } => ${t.newValue}`,
    );

    log.info([
      `performed ${
        nt
      } transformation${
        nt !== 1 ? 's' : ''
      } in "${filePath}":`,
      ...details,
      '',
    ].join('\n'));
  }

  return nt;
};

const isPathBlacklisted = (filePath: string): boolean => {
  if (/\bnode_modules\b/.test(filePath)) {
    return true;
  }

  return false;
};

const startWatching = async (dirPath: string): Promise<void> => {
  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) {
      bail('Path does not point to a directory.');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      bail(`Unexpected error ${e.code}`);
    }
    bail('Directory does not exist.');
  }

  log.info(`started watching directory ${dirPath}`);
  log.info('...');

  chokidar.watch(dirPath).on('all', (event, eventPath) => {
    if (event === 'add' || event === 'change') {
      if (
        eventPath.endsWith('.js')
          && !isPathBlacklisted(eventPath)
      ) {
        processFile(eventPath, {
          assumePathAndTypeValid: true,
        });
      }
    }
  });
};

if (process.env.YAB_RUN) {
  if (process.env.YAB_RUN === 'watch') {
    startWatching(inputPathArgument);
  } else {
    processFile(inputPathArgument);
  }
}

// TODO update the source-maps
