import {
  stat,
} from 'fs/promises';

import path from 'path';
import { URL } from 'url';

import minimist from 'minimist';
import chokidar from 'chokidar';

import {
  hasOwnProperty,
  postpone,
  recursivelyReadDirectory,
} from './lib/util';

import log, { strong } from './lib/log';
import usage from './usage';

import {
  isProcessable,
  processFile,
} from './processFile';

const metaURLString = import.meta.url;
const {
  pathname: thisScriptPathname,
} = new URL(metaURLString);

const printUsage = () => log(usage);

const bail = (errMessage: string, exitCode = 1): never => {
  log(`\n>> Error: ${errMessage}\n`);
  printUsage();
  process.exit(exitCode);
};

const {
  _: [userProvidedPathname],
  ...options
} = minimist(process.argv.slice(2));

if (!userProvidedPathname) {
  bail('Please provide a path to a directory to watch.');
}

const tryAndProcessFile = async (pathname: string) => {
  try {
    await processFile(pathname);
  } catch (e) {
    if (e.code === 'BABEL_PARSER_SYNTAX_ERROR') {
      log.error(
        `Babel was not able to parse the file "${pathname}", so it wasn't processed.`,
        'The error reported by babel was:',
        e.message,
        'You should probably check the source TypeScript file.',
        'Your JavaScript Application will most likely not be able to run.',
      );
    } else {
      throw e;
    }
  }
};

const startWatching = async (dirPath: string): Promise<void> => {
  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) {
      bail('Path does not point to a directory.');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      bail(`Unexpected error ${e.code}`);
    }
    bail('Directory does not exist.');
  }

  log.info(`started watching directory ${dirPath}`);

  let nDirs = 0;
  let nFiles = 0;
  let nProcessable = 0;

  const report = postpone(500)(
    () => log(
      `watching ${nDirs
      } directories totalling ${nFiles
      } files, of which ${nProcessable
      } are of interest to us`,
    ),
  );

  chokidar.watch(dirPath).on('all', async (event, eventPath) => {
    if (event === 'add') {
      nFiles += 1;
      if (isProcessable(eventPath)) {
        nProcessable += 1;
      }
      report();
    }

    if (event === 'addDir') {
      nDirs += 1;
      report();
    }

    if (event === 'unlink') {
      nFiles -= 1;
      if (isProcessable(eventPath)) {
        nProcessable -= 1;
        report();
      }
    }

    if (event === 'unlinkDir') {
      nDirs -= 1;
      report();
    }

    if (event === 'add' || event === 'change') {
      if (isProcessable(eventPath)) {
        tryAndProcessFile(eventPath);
        if (path.resolve(eventPath) === thisScriptPathname) {
          log.warning('YAB is watching its own transpilation directory');
        }
      }
    }
  });
};

const processOnce = async (pathname: string) => {
  const allFiles = await recursivelyReadDirectory(pathname);
  const processableFiles = allFiles.filter(isProcessable);
  log.info(`Processing files in "${pathname}" and then exiting.`);
  log.info('Found files:');
  processableFiles.forEach((file) => {
    log.info(`  ${strong(file)}`);
  });
  await Promise.all(processableFiles.map(tryAndProcessFile));
  log.info('All done here. Have a nice day!');
};

if (hasOwnProperty(options, 'once')) {
  processOnce(userProvidedPathname);
} else {
  startWatching(userProvidedPathname);
}
