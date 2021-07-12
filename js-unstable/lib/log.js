import colors from 'colors/safe.js';
const { blue, bold, green, red, yellow, } = colors;
const toString = (args) => {
    if (typeof args === 'string' || typeof args === 'number') {
        return `${args};`;
    }
    if (args instanceof Array) {
        return args.map(toString).join(' ');
    }
    return JSON.stringify(args, null, 2);
};
export const log = (...args) => {
    // const time = new Date(Date.now()).toLocaleString();
    // eslint-disable-next-line no-console
    console.log(...args);
};
/** will be improved later */
log.info = log;
log.warning = (...args) => log(`[ ⚠ ${bold(yellow(toString(args)))} ⚠ ]`);
log.debug = (...args) => log(blue(toString(args)));
log.error = (...args) => log(red([
    '[!!!]',
    ...args,
].join(' ')));
export const strong = (str) => bold(green(`${str}`));
export default log;
//# sourceMappingURL=log.js.map