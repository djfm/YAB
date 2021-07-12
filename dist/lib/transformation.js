export const sortTransformations = (transformations, sortOrder = 'asc') => {
    const sign = sortOrder === 'asc' ? -1 : 1;
    return transformations.slice().sort((a, b) => {
        if (a.start.line < b.start.line) {
            return sign;
        }
        if (a.start.line > b.start.line) {
            return -sign;
        }
        return sign * (b.start.column - a.start.column);
    });
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
// TODO this method is probably not robust enough even-though unit-tested
// for basic cases and some a bit more advanced
const applySingleTransformation = (sourceLines, transformation) => {
    const { start, end } = transformation;
    const isSourceMultiLine = start.line
        < end.line;
    if (sourceLines.length < start.line) {
        throw new Error('transformation cannot be applied - not enough input lines');
    }
    // lines before our target that are sure
    // to remain unchanged
    const linesBefore = sourceLines.slice(0, start.line - 1);
    // lines that we will change, totally or partially
    const linesToModify = sourceLines.slice(start.line - 1, end.line);
    // lines after our target that are sure
    // to remain unchanged
    const linesAfter = sourceLines.slice(end.line);
    // the part in the first modified line that we won't transform
    const leftPartOfFirstModifiedLine = linesToModify[0]
        .slice(0, start.column);
    // the part in the first modified line that we will transform
    const rightPartOfFirstModifiedLine = linesToModify[0]
        .slice(start.column, isSourceMultiLine ? undefined : end.column);
    // the part in the last modified line that we will transform
    // it's empty in the single line case because we have it captured
    // in the rightPartOfFirstModifiedLine already
    const leftPartOfLastModifiedLine = isSourceMultiLine
        ? linesToModify[linesToModify.length - 1]
            .slice(0, end.column)
        : '';
    // the part in the last modified line that we won't transform
    // works for both single and multi-line transformations
    const rightPartOfLastModifiedLined = linesToModify[linesToModify.length - 1].slice(end.column);
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
    ].join(isSourceMultiLine ? '\n' : '');
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
    return [
        ...linesBefore,
        ...newModifiedLines,
        ...linesAfter,
    ];
};
export const applyTransformations = (unorderedTransformations, sourceCode) => {
    const ascTransformations = sortTransformations(unorderedTransformations, 'asc');
    if (transformationsOverlap(ascTransformations)) {
        throw new Error('overlapping transformations cannot be applied');
    }
    const descTransformations = sortTransformations(unorderedTransformations, 'desc');
    return descTransformations.reduce(applySingleTransformation, sourceCode.split('\n')).join('\n');
};
export default applyTransformations;
//# sourceMappingURL=transformation.js.map