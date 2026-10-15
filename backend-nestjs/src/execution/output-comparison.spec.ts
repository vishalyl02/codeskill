import { compareOutput } from './output-comparison';
describe('output comparison', () => {
  it.each([
    ['hello\n', 'hello', {}, true],
    [' hello', 'hello', {}, false],
    ['a b', 'ab', {}, false],
    ['a  b', 'a b', {}, false],
    ['a \n', 'a', {}, true],
    ['a\n', 'a', { exactOutput: true }, false],
    ['a ', 'a', { trimTrailingWhitespace: false }, false],
    ['1.00001', '1', { floatTolerance: 0.0001 }, true],
    ['1.1', '1', { floatTolerance: 0.0001 }, false],
    [
      '1000.1',
      '1000',
      { floatTolerance: 0, floatRelativeTolerance: 0.001 },
      true,
    ],
    ['NaN', '0', { floatTolerance: 1 }, false],
    ['Infinity', '1', { floatTolerance: 1 }, false],
    ['answer 1.01', 'answer 1', { floatTolerance: 0.02 }, true],
    ['answer  1.01', 'answer 1', { floatTolerance: 0.02 }, false],
    ['1e999', '1e998', { floatTolerance: 1 }, false],
    ['a\r\n', 'a\n', {}, true],
    ['a\r\n', 'a\n', { exactOutput: true }, false],
  ])('compares %j with %j using %j', (actual, expected, policy, passed) => {
    expect(compareOutput(actual, expected, policy)).toBe(passed);
  });
});
