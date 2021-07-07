import path from 'path';

import { shouldAppendJsExtension } from '../src/lib/appendJsExtension';

type Scenario = {
  // relative to the "tests/fixtures" director
  // for simplicity
  file: string
  specifier: string

  // expected result
  append: boolean
}

const testData: Scenario[] = [{
  file: 'topLevel.js',
  specifier: 'fs/promises',
  append: false,
}, {
  file: 'topLevel.js',
  specifier: 'colors/safe',
  append: true,
}];

describe([
  'the "shouldAppendJsExtension" determines whether or not',
  'to append the ".js" extension to the import statement\'s specifier',
].join(' '), () => {
  test.each(testData)(
    "add '.js' to «import foo from '$specifier';» in file '$file'? $append",
    async ({ file, specifier, append }) => {
      const importingFilePath = path.resolve(
        'fixtures', file,
      );

      const actual = await shouldAppendJsExtension(
        importingFilePath,
        specifier,
      );

      expect(actual).toBe(append);
    },
  );
});
