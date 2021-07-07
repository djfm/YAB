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

const makeScenario = (
  file: string,
  specifier: string,
  append: boolean,
): Scenario => ({
  file,
  specifier,
  append,
});

const testData: Scenario[] = [
  makeScenario('topLevel.js', 'fs/promises', false),
  makeScenario('topLevel.js', 'colors/safe', true),
  makeScenario('topLevel.js', './mod', true),
];

describe([
  'the "shouldAppendJsExtension" determines whether or not',
  'to append the ".js" extension to the import statement\'s specifier',
].join(' '), () => {
  test.each(testData)(
    "add '.js' to «import foo from '$specifier';» in file '$file'? $append",
    async ({ file, specifier, append }) => {
      const importingFilePath = path.resolve(
        'tests', 'fixtures', file,
      );

      const actual = await shouldAppendJsExtension(
        importingFilePath,
        specifier,
      );

      expect(actual).toBe(append);
    },
  );
});
