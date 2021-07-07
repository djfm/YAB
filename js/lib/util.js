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
//# sourceMappingURL=util.js.map