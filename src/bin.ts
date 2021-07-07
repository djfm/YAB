import path from 'path';
import { URL } from 'url';
import minimist from 'minimist';
import chokidar from 'chokidar';

import {
  bail,
  log,
  postpone,
} from './lib/util';

import {
  startWatching,
} from './runner';

const metaURLString = import.meta.url;
const {
  pathname: thisScriptPathname,
} = new URL(metaURLString);

const [inputPathArgument] = minimist(process.argv.slice(2))._;

if (!inputPathArgument) {
  bail('Please provide a path to a directory to watch.');
}

const onChange = (
  event: string,
  pathname: string,
) => {
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

const selfReload = (watcherP: Promise<chokidar.FSWatcher>) => async () => {
  const watcher = await watcherP;
  log.info('self-reloading because of file-changes');

  // eslint-disable-next-line import/no-unresolved
  const { startWatching: newWatcher } = await import('./runner.js');
  await watcher.close();
  newWatcher(inputPathArgument, onChange);
};

const watcher = startWatching(inputPathArgument, onChange);
