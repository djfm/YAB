import path from 'path';
import { URL } from 'url';
import minimist from 'minimist';
import { bail, log, postpone, } from './lib/util.js';
import { startWatching, } from './runner.js';
const metaURLString = import.meta.url;
const { pathname: thisScriptPathname, } = new URL(metaURLString);
const [inputPathArgument] = minimist(process.argv.slice(2))._;
if (!inputPathArgument) {
    bail('Please provide a path to a directory to watch.');
}
const onChange = (event, pathname) => {
    if (event !== 'change') {
        return;
    }
    if (!thisScriptPathname.endsWith('.js')) {
        // ensure we are running the transpiled version
        return;
    }
    const rel = path.relative(path.dirname(thisScriptPathname), pathname);
    if (!rel.startsWith('.') && !rel.startsWith('/')) {
        // the changed path is inside the directory
        // where this script lives
        // wait for things to settle down, then self-reload
        postpone(1000)(selfReload(watcher))();
    }
};
const selfReload = (watcherP) => async () => {
    const watcher = await watcherP;
    log.info('self-reloading because of file-changes');
    // eslint-disable-next-line import/no-unresolved
    const { startWatching: newWatcher } = await import('./runner.js');
    await watcher.close();
    newWatcher(inputPathArgument, onChange);
};
const watcher = startWatching(inputPathArgument, onChange);
//# sourceMappingURL=bin.js.map
