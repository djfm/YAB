import {
  readFile,
  writeFile,
} from 'fs/promises';

import {
  applyTransformations,
  Transformation,
} from './lib/transformation';

import transformFile from './lib/transformFile';

import {
  log,
  strong,
} from './lib/log';

export const isProcessable = (p: string): boolean =>
  p.endsWith('.js');

// TODO update the source-maps
export const processFile = async (
  pathname: string,
): Promise<number> => {
  const buffer = await readFile(pathname);
  const sourceCode = buffer.toString();

  const [transformations] = await transformFile(sourceCode, {
    pathname,
  });

  const nt = transformations.length;

  if (nt > 0) {
    const transformedSource = applyTransformations(
      transformations,
      sourceCode,
    );

    await writeFile(pathname, transformedSource);

    const details = transformations.map(
      (t: Transformation) => `    ${
        t?.metaData?.type
      } ${
        strong([
          t.originalValue,
          '→',
          t.newValue,
        ].join(' '))
      }`,
    );

    log.info([
      `\nperformed ${
        nt
      } transformation${
        (nt !== 1 ? 's' : '')
      } in ${
        strong(pathname)
      }:`,
      ...details,
      '',
    ].join('\n'));
  }

  return nt;
};
