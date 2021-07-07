import { stat, readFile, writeFile, } from 'fs/promises';
import chokidar from 'chokidar';
import { bail, log, postpone, } from './lib/util.js';
import { applyTransformations, transform, } from './lib/transformation.js';
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
export const startWatching = async (dirPath, onChange) => {
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
    const watcher = chokidar.watch(dirPath).on('all', async (event, eventPath) => {
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
                if (onChange) {
                    onChange('unlink', eventPath);
                }
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
                try {
                    await processFile(eventPath, {
                        assumePathAndTypeValid: true,
                    });
                    if (onChange) {
                        onChange(event, eventPath);
                    }
                }
                catch (e) {
                    if (e.code === 'BABEL_PARSER_SYNTAX_ERROR') {
                        log.warning('babel encountered a syntax error in file', eventPath, 'so we could not process it');
                    }
                    else {
                        throw e;
                    }
                }
            }
        }
    });
    return watcher;
};
//# sourceMappingURL=runner.js.map