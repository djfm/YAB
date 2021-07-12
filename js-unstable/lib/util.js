import { readdir, stat } from 'fs/promises';
import path from 'path';
// eslint-disable-next-line import/prefer-default-export
export const postpone = (nMilliseconds) => (fn) => {
    let lastCallTime = Date.now();
    let currentTimeout;
    const wrappedFn = (...args) => {
        const tooEarly = () => (Date.now() - lastCallTime) < nMilliseconds;
        const scheduleCall = () => {
            if (currentTimeout) {
                clearTimeout(currentTimeout);
            }
            currentTimeout = setTimeout(() => wrappedFn(...args), nMilliseconds);
        };
        if (tooEarly()) {
            scheduleCall();
        }
        else {
            lastCallTime = Date.now();
            fn(...args);
        }
    };
    return wrappedFn;
};
export const statOrUndefined = async (pathname) => {
    try {
        const s = await stat(pathname);
        return s;
    }
    catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
        return undefined;
    }
};
export const hasOwnProperty = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
/**
 * Recursively reads a directory's content, returning
 * only the files with their relative paths
 * relative to dirPathName.
 */
export const recursivelyReadDirectory = async (dirPathname) => {
    const dirEntries = await readdir(dirPathname);
    const deeperEntries = await Promise.all(dirEntries.map(async (entry) => {
        const entryPath = path.join(dirPathname, entry);
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory()) {
            const nested = await recursivelyReadDirectory(entryPath);
            return nested;
        }
        return [entryPath];
    }));
    const flattenedEntries = [].concat(...deeperEntries);
    return flattenedEntries;
};
//# sourceMappingURL=util.js.map