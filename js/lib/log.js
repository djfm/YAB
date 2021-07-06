export const log = (...args) => {
    // eslint-disable-next-line no-console
    console.log(...args);
};
/** will be improved later */
log.info = log;
log.warning = log;
log.error = log;
export default log;
//# sourceMappingURL=log.js.map