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

const src = (str: TemplateStringsArray): string =>
  str
    .join('')
    .trim()
    .split('\n')
    .map((line) => line.trim().slice(1, -1))
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
  test('a single valid transformation', () => {
    const source = src`
    $          $
    $    abc   $
    $          $
    $          $
    $          $
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
    $          $
    $    xy   $
    $          $
    $          $
    $          $
    `;

    const transformedSource = applyTransformations(
      [t],
      source,
    );

    expect(transformedSource).toBe(expected);
  });

  test('two valid transformations', () => {
    const source = src`
    $          $
    $    abc   $
    $          $
    $def       $
    $          $
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
    $          $
    $    xy   $
    $          $
    $poulpe       $
    $          $
    `;

    const transformedSource = applyTransformations(
      [t, u],
      source,
    );

    expect(transformedSource).toBe(expected);
  });

  test('two transformations on the same line', () => {
    const source = src`
    $          $
    $ ab   cd  $
    $          $
    $          $
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
    $          $
    $ AB   CD  $
    $          $
    $          $
    `;

    const transformedSource = applyTransformations(
      [t, u],
      source,
    );

    expect(transformedSource).toBe(expected);
  });

  test('an invalid transformation throws', () => {
    const source = src`
    $          $
    $    abc   $
    $          $
    $          $
    $          $
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
    )).toThrow('did not find expected source string')
  });

  test([
    'that an error is thrown if there are',
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
    'that an error is thrown if there are',
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
