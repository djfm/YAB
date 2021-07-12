import colors from 'colors/safe.js';

const {
  blue,
  bold,
  green,
  red,
  yellow,
} = colors;

const toString = (args: unknown[] | unknown): string => {
  if (typeof args === 'string' || typeof args === 'number') {
    return `${args};`;
  }

  if (args instanceof Array) {
    return args.map(toString).join(' ');
  }

  return JSON.stringify(args, null, 2);
};

export const log = (...args: unknown[]): void => {
  // const time = new Date(Date.now()).toLocaleString();
  // eslint-disable-next-line no-console
  console.log(...args);
};

/** will be improved later */
log.info = log;
log.warning = (...args: unknown[]) => log(
  `[ ⚠ ${bold(yellow(toString(args)))} ⚠ ]`,
);

log.debug = (...args: unknown[]): void =>
  log(blue(toString(args)));

log.error = (...args: unknown[]): void =>
  log(red([
    '[!!!]',
    ...args,
  ].join(' ')));

export const strong = (str: string | number): string =>
  bold(green(`${str}`));

export default log;
