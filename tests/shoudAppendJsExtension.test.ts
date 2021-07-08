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
  makeScenario('importingFile.js', 'fs/promises', false),
  makeScenario('importingFile.js', 'colors/safe', true),
  makeScenario('importingFile.js', './mod', true),
  makeScenario('importingFile.js', './mod.js', false),
  makeScenario('importingFile.js', 'modNoPackageJSON', false),
  makeScenario('importingFile.js', 'modNoPackageJSON/fp', true),
  makeScenario('importingFile.js', 'modWithPackageJSONAndMatchingExports/fp', false),
  makeScenario('importingFile.js', 'modWithPackageJSONButNoExportsAtAll/fp', true),
  makeScenario('./lib/util/leftPad.js', 'modWithPackageJSONAndMatchingExports/fp', false),
  makeScenario('./lib/util/leftPad.js', 'modWithPackageJSONButNoExportsAtAll/fp', true),
  makeScenario('./lib/util/leftPad.js', '../../mod.js', false),
  makeScenario('./lib/util/leftPad.js', '../../mod.js', false),
  makeScenario('./lib/util/leftPad.js', 'modWithPackageJSONAndMatchingExports/fp', false),
  makeScenario('./lib/util/leftPad.js', 'modWithPackageJSONButNoExportsAtAll/fp', true),
];

describe([
  '"shouldAppendJsExtension" is a function that decides if a ".js" extension',
  'should be appended to to an import statement',
].join(' '), () => {
  test.each(testData)(
    "add '.js' to «import foo from '$specifier';» in file '$file'? $append",
    async ({ file, specifier, append }) => {
      const importingFilePath = path.resolve(
        'tests', 'fixtures', file,
      );

      if (specifier === 'modNoPackageJSON/fp') {
        debugger;
      }

      const actual = await shouldAppendJsExtension(
        importingFilePath,
        specifier,
      );

      expect(actual).toBe(append);
    },
  );
});
