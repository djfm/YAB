import { resolveTripleslashReference } from 'typescript';
import {
  applyTransformations,
  sortTransformations,
  Transformation,
} from '../src/index';

const mkTransform = (
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): Transformation => ({
  start: {
    line: startLine,
    column: startColumn,
  },
  end: {
    line: endLine,
    column: endColumn,
  },
  originalValue: '',
  newValue: '',
});

const tryToApplyTransformationBrutally = (
  transformation: Transformation,
  source: string,
): string | undefined => {
  const matchIsUnique = (source.indexOf(
    transformation.originalValue,
  ) === source.lastIndexOf(
    transformation.originalValue,
  )) !== undefined;

  if (!matchIsUnique) {
    return undefined;
  }

  return source.replace(
    transformation.originalValue,
    transformation.newValue,
  );
};

const src = (str: TemplateStringsArray): string =>
  str
    .join('')
    .trim()
    .split('\n')
    .map(
      (line) => line
        .trim()
        .slice(1, -1),
    )
    .join('\n');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const showSrc = (str: string): string => str
  .split('\n')
  .map((line) => `$${line.replace(/\s/g, '.')}$`)
  .join('\n');

describe('sorting transformations in increasing order', () => {
  test('should work for transformations on different lines', () => {
    const t1 = mkTransform(1, 1, 1, 2);
    const t2 = mkTransform(2, 1, 2, 2);
    const t3 = mkTransform(3, 1, 3, 2);
    expect(
      sortTransformations([t2, t1, t3]),
    ).toEqual([t1, t2, t3]);
  });

  test('should work with transformations on same line', () => {
    const t1 = mkTransform(1, 1, 1, 2);
    const t2a = mkTransform(2, 1, 2, 2);
    const t2b = mkTransform(2, 7, 3, 8);
    const t3 = mkTransform(3, 1, 4, 2);
    expect(
      sortTransformations([t2b, t1, t3, t2a]),
    ).toEqual([t1, t2a, t2b, t3]);
  });
});

describe('applying transformations', () => {
  const verifyExpected = (
    transformations: Transformation[],
    expected: string, source: string,
  ) => {
    const maybeExpected = transformations.reduce(
      (text: string | undefined, t: Transformation) => {
        if (text === undefined) {
          return text;
        }

        const maybeTransformed = tryToApplyTransformationBrutally(
          t, text,
        );

        return maybeTransformed;
      },
      source,
    );

    if (maybeExpected !== undefined) {
      if (maybeExpected !== expected) {
        throw new Error([
          'You may have made a mistake in defining',
          'the expected value for this test, as another',
          '- less subtle algorithm - ',
          'computes a different result. This may be wrong,',
          "it's just a warning. If you are sure the expected",
          'value is correct, then remove the "verifyExpected"',
          'call from the failing test.',
        ].join(' '));
      }
    }
  };

  test('a single valid transformation', () => {
    const source = src`
    $..........$
    $....abc...$
    $..........$
    $..........$
    $..........$
    `;

    const t: Transformation = {
      start: {
        line: 2,
        column: 4,
      },
      end: {
        line: 2,
        column: 7,
      },
      originalValue: 'abc',
      newValue: 'xy',
    };

    const expected = src`
    $..........$
    $....xy...$
    $..........$
    $..........$
    $..........$
    `;

    const transformations = [t];

    const transformedSource = applyTransformations(
      transformations,
      source,
    );

    verifyExpected(
      transformations,
      expected, source,
    );

    expect(transformedSource).toBe(expected);
  });

  test('two valid transformations', () => {
    const source = src`
    $..........$
    $....abc...$
    $..........$
    $def.......$
    $..........$
    `;

    const t: Transformation = {
      start: {
        line: 2,
        column: 4,
      },
      end: {
        line: 2,
        column: 7,
      },
      originalValue: 'abc',
      newValue: 'xy',
    };

    const u: Transformation = {
      start: {
        line: 4,
        column: 0,
      },
      end: {
        line: 4,
        column: 3,
      },
      originalValue: 'def',
      newValue: 'poulpe',
    };

    const expected = src`
    $..........$
    $....xy...$
    $..........$
    $poulpe.......$
    $..........$
    `;

    const transformations = [t, u];

    verifyExpected(
      transformations,
      expected, source,
    );

    const transformedSource = applyTransformations(
      transformations,
      source,
    );

    expect(transformedSource).toBe(expected);
  });

  test('two transformations on the same line', () => {
    const source = src`
    $..........$
    $.ab...cd..$
    $..........$
    $..........$
    `;

    const t: Transformation = {
      start: {
        line: 2,
        column: 1,
      },
      end: {
        line: 2,
        column: 3,
      },
      originalValue: 'ab',
      newValue: 'AB',
    };

    const u: Transformation = {
      start: {
        line: 2,
        column: 6,
      },
      end: {
        line: 2,
        column: 8,
      },
      originalValue: 'cd',
      newValue: 'CD',
    };

    const expected = src`
    $..........$
    $.AB...CD..$
    $..........$
    $..........$
    `;

    const transformations = [t, u];

    verifyExpected(
      transformations,
      expected, source,
    );

    const transformedSource = applyTransformations(
      transformations,
      source,
    );

    expect(transformedSource).toBe(expected);
  });

  test([
    'two transformations on different lines,',
    'one of which introduces a new line,',
    'most simple scenario',
  ].join(' '), () => {
    const source = src`
    $..........$
    $.ab.......$
    $..........$
    $......cd..$
    `;

    const t: Transformation = {
      start: {
        line: 2,
        column: 1,
      },
      end: {
        line: 2,
        column: 3,
      },
      originalValue: 'ab',
      newValue: 'A\nB',
      metaData: {
        t: true,
      },
    };

    const u: Transformation = {
      start: {
        line: 4,
        column: 6,
      },
      end: {
        line: 4,
        column: 8,
      },
      originalValue: 'cd',
      newValue: 'CD',
      metaData: {
        u: true,
      },
    };

    const expected = src`
    $..........$
    $.A$
    $B.......$
    $..........$
    $......CD..$
    `;

    const transformations = [t, u];

    verifyExpected(
      transformations,
      expected, source,
    );

    const transformedSource = applyTransformations(
      transformations,
      source,
    );

    expect(transformedSource).toBe(expected);
  });

  test('an invalid transformation throws', () => {
    const source = src`
    $..........$
    $....abc...$
    $..........$
    $..........$
    `;

    const t: Transformation = {
      start: {
        line: 2,
        column: 4,
      },
      end: {
        line: 2,
        column: 7,
      },
      originalValue: 'ab',
      newValue: 'xy',
    };

    expect(() => applyTransformations(
      [t], source,
    )).toThrow('did not find expected source string');
  });

  test([
    'an error is thrown if there are',
    'two overlapping transformations',
    '- different start lines',
  ].join(' '), () => {
    const t = mkTransform(
      10, 0,
      10, 5,
    );

    const u = mkTransform(
      9, 7,
      10, 1,
    );

    expect(
      () => applyTransformations(
        [t, u],
        '',
      ),
    ).toThrow('overlapping transformations');
  });

  test([
    'an error is thrown if there are',
    'two overlapping transformations',
    '- same start line',
  ].join(' '), () => {
    const t = mkTransform(
      10, 0,
      10, 5,
    );

    const u = mkTransform(
      10, 3,
      10, 4,
    );

    expect(
      () => applyTransformations(
        [t, u],
        '',
      ),
    ).toThrow('overlapping transformations');
  });
});
