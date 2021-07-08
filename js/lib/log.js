import colors from 'colors/safe.js';
export const log = (...args) => {
    // eslint-disable-next-line no-console
    console.log(...args);
};
/** will be improved later */
log.info = log;
log.warning = log;
log.error = (...args) => {
    log(colors.red([
        '[!!!]',
        ...args,
    ].join(' ')));
};
export default log;
//# sourceMappingURL=log.js.map