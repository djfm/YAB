import { stat, readFile, } from 'fs/promises';
import path from 'path';
import minimist from 'minimist';
import babelParser from '@babel/parser';
export const sortTransformations = (transformations) => transformations.slice().sort((a, b) => {
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
const bail = (errMessage, exitCode = 1) => {
    console.log(`Error: ${errMessage}`);
    printUsage();
    process.exit(exitCode);
};
const fail = (node, msg = '') => {
    const additional = msg ? ` - ${msg}` : '';
    throw new Error(`Failed on node with type ${node.type}${additional}`);
};
const knownExtensions = [
    '.js', '.jsx', '.ts', '.tsx',
    '.cjs', '.mjs',
];
const hasKnownExtension = (str) => {
    for (const ext of knownExtensions) {
        if (str.endsWith(`.${ext}`)) {
            return true;
        }
    }
    return false;
};
const transform = async (sourceCode, info) => {
    const transformations = [];
    const metaData = {};
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
                    const [, maybeSourceMappingURL] = comment.value.split('sourceMappingURL=');
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
            const { value: importPath, extra: { raw }, } = source;
            if (!raw) {
                return fail(source, 'no value for "extra.raw"');
            }
            if (typeof raw !== 'string') {
                return fail(source, '"extra.raw" is not a string');
            }
            if (importPath.startsWith('./')) {
                if (info.filePath.endsWith('.js')) {
                    if (!hasKnownExtension(importPath)) {
                        const importedFromDir = path.dirname(info.filePath);
                        const targetWithoutExt = path.join(importedFromDir, importPath);
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
                        }
                        catch (e) {
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
    return [transformations, metaData];
};
const [inputFilePath] = minimist(process.argv.slice(2))._;
const applySingleTransformation = (transformation, sourceLines, location) => {
    if (transformation.start.line < location.line) {
        throw new Error('transformation cannot be applied - started before');
    }
    if (location.line + sourceLines.length
        < transformation.start.line) {
        throw new Error('transformation cannot be applied - not enough input lines');
    }
    const offsetStartLine = transformation.start.line
        - location.line;
    const linesBefore = sourceLines.slice(0, offsetStartLine);
    const linesAfter = sourceLines.slice(offsetStartLine + 1);
    const lineToModify = sourceLines[offsetStartLine];
    const leftOfSource = lineToModify.slice(0, transformation.start.column);
    const source = lineToModify.slice(transformation.start.column, transformation.end.column);
    if (source !== transformation.originalValue) {
        throw new Error(`did not find expected source string - got "${source}" instead of ${transformation.originalValue}`);
    }
    const rightOfSource = lineToModify.slice(transformation.end.column);
    const newModifiedLine = [
        leftOfSource,
        transformation.newValue,
        rightOfSource,
    ].join('');
    return {
        processedSourceLines: linesBefore.concat(newModifiedLine),
        remainingSourceLines: linesAfter,
        locationInSource: {
            line: location.line + linesBefore.length + 1,
            column: 0,
        },
    };
};
const recursivelyApplyTransformations = (transformations, sourceLines, location) => {
    if (transformations.length === 0) {
        return {
            processedSourceLines: [],
            remainingSourceLines: [],
            locationInSource: location,
        };
    }
    const [t, ...remainingTransformations] = transformations;
    const tResult = applySingleTransformation(t, sourceLines, location);
    if (remainingTransformations.length === 0) {
        const processedSourceLines = tResult
            .processedSourceLines.concat(tResult.remainingSourceLines);
        return {
            processedSourceLines,
            remainingSourceLines: [],
            locationInSource: {
                line: processedSourceLines.length + 1,
                column: processedSourceLines[processedSourceLines.length - 1].length,
            },
        };
    }
    const restResult = recursivelyApplyTransformations(remainingTransformations, tResult.remainingSourceLines, tResult.locationInSource);
    return {
        ...restResult,
        processedSourceLines: tResult.processedSourceLines.concat(restResult.processedSourceLines),
    };
};
/**
 * Checks whether there are overlapping transformations
 * within the provided array.
 *
 * As indicated by the parameter type, the function
 * assumes that the transformations have already been
 * sorted (with sortTransformations).
 */
const transformationsOverlap = (sortedTransformations) => {
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
export const applyTransformations = (unorderedTransformations, sourceCode) => {
    const transformations = sortTransformations(unorderedTransformations);
    if (transformationsOverlap(transformations)) {
        throw new Error('overlapping transformations cannot be applied');
    }
    const sourceLines = sourceCode.split('\n');
    const location = {
        line: 1,
        column: 0,
    };
    const result = recursivelyApplyTransformations(transformations, sourceLines, location);
    return result.processedSourceLines.join('\n');
};
const processFile = async (filePath) => {
    try {
        const s = await stat(filePath);
        if (!s.isFile()) {
            bail('Path does not point to a file.');
        }
    }
    catch (e) {
        bail('File does not exist.');
    }
    const buffer = await readFile(filePath);
    const sourceCode = buffer.toString();
    const [transformations, metaData] = await transform(sourceCode, {
        filePath,
    });
    const transformedSource = applyTransformations(transformations, sourceCode);
    /*
    console.log(JSON.stringify(
      { transformations, transformedSource, metaData },
      null,
      2,
    ));
    */
    return transformations.length;
};
if (process.env.EXEC_TIDY) {
    processFile(inputFilePath).then(console.log, console.log);
}
//# sourceMappingURL=index.js.map