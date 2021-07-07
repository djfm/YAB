import { stat } from 'fs/promises';
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
//# sourceMappingURL=util.js.map