import { readFile, writeFile, } from 'fs/promises';
import { applyTransformations, } from './lib/transformation.js';
import transformFile from './lib/transformFile.js';
import log from './lib/log.js';
// TODO update the source-maps
export const processFile = async (pathname) => {
    const buffer = await readFile(pathname);
    const sourceCode = buffer.toString();
    const [transformations] = await transformFile(sourceCode, {
        pathname,
    });
    const nt = transformations.length;
    if (nt > 0) {
        const transformedSource = applyTransformations(transformations, sourceCode);
        await writeFile(pathname, transformedSource);
        const details = transformations.map((t) => `    ${t?.metaData?.type} ${t.originalValue} => ${t.newValue}`);
        log.info([
            `performed ${nt} transformation${nt !== 1 ? 's' : ''} in "${pathname}":`,
            ...details,
        ].join('\n'));
    }
    return nt;
};
export const isPathBlacklisted = (filePath) => {
    if (/\bnode_modules\b/.test(filePath)) {
        return true;
    }
    return false;
};
//# sourceMappingURL=processFile.js.map