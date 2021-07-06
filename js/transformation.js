import path from 'path';
import { stat } from 'fs/promises';
import babelParser from '@babel/parser';
const fail = (node, ...msgParts) => {
    const msgLines = msgParts.length === 0 ? [
        'An unspecified error occurred.',
    ] : msgParts;
    msgLines.push(`Nearest related AST Node has type ${node.type}.`);
    throw new Error(msgParts.join('\n'));
};
export const sortTransformations = (transformations) => transformations.slice().sort((a, b) => {
    if (a.start.line < b.start.line) {
        return -1;
    }
    if (a.start.line > b.start.line) {
        return 1;
    }
    return a.start.column - b.start.column;
});
const knownExtensions = [
    'js', 'jsx', 'ts', 'tsx',
    'cjs', 'mjs',
];
const hasKnownExtension = (str) => {
    for (const ext of knownExtensions) {
        if (str.endsWith(`.${ext}`)) {
            return true;
        }
    }
    return false;
};
export const transform = async (sourceCode, info) => {
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
                        }
                        catch (e) {
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
// TODO this method is probably not robust enough even-though unit-tested
// for basic cases and some a bit more advanced
const applySingleTransformation = (transformation, sourceLines, convertToTransformed) => {
    const convertedStart = convertToTransformed(transformation.start);
    const convertedEnd = convertToTransformed(transformation.end);
    const isSourceMultiLine = convertedStart.line
        < convertedEnd.line;
    if (sourceLines.length < convertedStart.line) {
        throw new Error('transformation cannot be applied - not enough input lines');
    }
    // lines before our target that are sure
    // to remain unchanged
    const linesBefore = sourceLines.slice(0, convertedStart.line - 1);
    // lines that we will change, totally or partially
    const linesToModify = sourceLines.slice(convertedStart.line - 1, convertedEnd.line);
    // lines after our target that are sure
    // to remain unchanged
    const linesAfter = sourceLines.slice(convertedEnd.line);
    // the part in the first modified line that we won't transform
    const leftPartOfFirstModifiedLine = linesToModify[0]
        .slice(0, convertedStart.column);
    // the part in the first modified line that we will transform
    const rightPartOfFirstModifiedLine = linesToModify[0]
        .slice(convertedStart.column, isSourceMultiLine ? undefined : convertedEnd.column);
    // the part in the last modified line that we will transform
    // it's empty in the single line case because we have it captured
    // in the rightPartOfFirstModifiedLine already
    const leftPartOfLastModifiedLine = isSourceMultiLine
        ? linesToModify[linesToModify.length - 1]
            .slice(0, convertedEnd.column)
        : '';
    // the part in the last modified line that we won't transform
    // works for both single and multi-line transformations
    const rightPartOfLastModifiedLined = linesToModify[linesToModify.length - 1].slice(convertedEnd.column);
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
        throw new Error(`did not find expected source string - got "${source}" instead of ${transformation.originalValue}`);
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
    const newConverter = (loc) => {
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
const recursivelyApplyTransformations = (transformations, previousResult) => {
    if (transformations.length === 0) {
        return previousResult;
    }
    const [t, ...remainingTransformations] = transformations;
    const newResult = applySingleTransformation(t, previousResult.sourceLines, previousResult.convertToTransformed);
    return recursivelyApplyTransformations(remainingTransformations, newResult);
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
    const initialState = {
        sourceLines,
        convertToTransformed: (loc) => loc,
    };
    const result = recursivelyApplyTransformations(transformations, initialState);
    return result.sourceLines.join('\n');
};
//# sourceMappingURL=transformation.js.map