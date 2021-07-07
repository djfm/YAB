import usage from '../usage.js';
export const log = (...args) => {
    // eslint-disable-next-line no-console
    console.log(...args);
};
/** will be improved later */
log.info = log;
log.warning = log;
log.error = log;
export const printUsage = () => log(usage);
export const bail = (errMessage, exitCode = 1) => {
    log(`\n>> Error: ${errMessage}\n`);
    printUsage();
    process.exit(exitCode);
};
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
//# sourceMappingURL=util.js.map
