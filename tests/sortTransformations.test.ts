import {
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

describe('sorting transformations in increasing order', () => {
  test('should work for transformations on different lines', () => {
    const t1 = mkTransform(1, 1, 1, 2);
    const t2 = mkTransform(2, 1, 2, 2);
    expect(
      sortTransformations([t2, t1]),
    ).toEqual([t1, t2]);
  });
});
