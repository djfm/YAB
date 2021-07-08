import {
  stat,
} from 'fs/promises';

import path from 'path';
import { URL } from 'url';

import minimist from 'minimist';
import chokidar from 'chokidar';

import {
  postpone,
} from './lib/util';

import log from './lib/log';
import usage from './usage';

import {
  isPathBlacklisted,
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

const [inputPathArgument] = minimist(process.argv.slice(2))._;

if (!inputPathArgument) {
  bail('Please provide a path to a directory to watch.');
}

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

  const isProcessable = (p: string) =>
    p.endsWith('.js')
    && !isPathBlacklisted(p);

  chokidar.watch(dirPath).on('all', async (event, eventPath) => {
    if (event === 'add') {
      nFiles += 1;
      if (isProcessable(eventPath)) {
        nProcessable += 1;
        report();
      }
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
        try {
          await processFile(eventPath);
        } catch (e) {
          if (e.code === 'BABEL_PARSER_SYNTAX_ERROR') {
            log.error(
              `Babel was not able to parse the file "${eventPath}", so it wasn't processed.`,
              'The error reported by babel was:',
              e.message,
            );
          } else {
            throw e;
          }
        }

        if (path.resolve(eventPath) === thisScriptPathname) {
          log.info('[YAB is watching its own transpilation directory]');
        }
      }
    }
  });
};

startWatching(inputPathArgument);
