import { stat } from 'fs/promises';

type voidReturningFunction = (
  ...args: unknown[]
) => void;

// eslint-disable-next-line import/prefer-default-export
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

export const statOrUndefined = async (
  pathname: string,
): Promise <ReturnType<typeof stat> | undefined> => {
  try {
    const s = await stat(pathname);
    return s;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
    return undefined;
  }
};

export const hasOwnProperty = <property extends PropertyKey>(
  obj: unknown,
  prop: property,
): obj is Record<property, unknown> =>
    Object.prototype.hasOwnProperty.call(obj, prop);
