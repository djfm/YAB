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
