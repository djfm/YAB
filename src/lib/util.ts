import usage from '../usage';

type voidReturningFunction = (
  ...args: unknown[]
) => void;

export const log = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.log(...args);
};

/** will be improved later */
log.info = log;
log.warning = log;
log.error = log;

export const printUsage = (): void => log(usage);

export const bail = (errMessage: string, exitCode = 1): never => {
  log(`\n>> Error: ${errMessage}\n`);
  printUsage();
  process.exit(exitCode);
};

export const postpone = (nMilliseconds: number) =>
  (fn: voidReturningFunction): voidReturningFunction => {
    let lastCallTime = Date.now();
    let currentTimeout: ReturnType<typeof setTimeout> | undefined;

    const wrappedFn = (...args: unknown[]) => {
      const tooEarly = () =>
        (Date.now() - lastCallTime) < nMilliseconds;

      const scheduleCall = () => {
        if (currentTimeout) {
          clearTimeout(currentTimeout);
        }

        currentTimeout = setTimeout(
          () => wrappedFn(...args),
          nMilliseconds,
        );
      };

      if (tooEarly()) {
        scheduleCall();
      } else {
        lastCallTime = Date.now();
        fn(...args);
      }
    };

    return wrappedFn;
  };
