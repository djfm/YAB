import { readdir, stat } from 'fs/promises';
import path from 'path';

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

/**
 * Recursively reads a directory's content, returning
 * only the files with their relative paths
 * relative to dirPathName.
 */
export const recursivelyReadDirectory = async (
  dirPathname: string,
): Promise<string[]> => {
  const dirEntries = await readdir(dirPathname);

  const deeperEntries = await Promise.all(dirEntries.map(
    async (entry: string): Promise<string[]> => {
      const entryPath = path.join(dirPathname, entry);

      const entryStat = await stat(entryPath);

      if (entryStat.isDirectory()) {
        const nested = await recursivelyReadDirectory(entryPath);
        return nested;
      }

      return [entryPath];
    },
  ));

  const flattenedEntries = ([] as string[]).concat(...deeperEntries);

  return flattenedEntries;
};
