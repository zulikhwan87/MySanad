import { describe, expect, it } from 'vitest';
import { directoryHref, escapeLike, pageCount, parseDirectoryParams } from '@/lib/validations/search';

const ID = '11111111-1111-4111-8111-111111111111';

describe('parseDirectoryParams', () => {
  it('keeps valid values and drops invalid ones without throwing', () => {
    expect(parseDirectoryParams({ q: '  Ahmad ', qiraat: ID, halaman: '2', negeri: 'kelantan' })).toEqual({
      q: 'Ahmad',
      qiraat: ID,
      halaman: 2,
      negeri: 'kelantan',
    });
    const bad = parseDirectoryParams({ qiraat: "1' OR 1=1", halaman: '-4', negeri: '../../etc', q: 'x'.repeat(500) });
    expect(bad).toEqual({ halaman: 1 });
  });

  it('takes the first value of repeated params', () => {
    expect(parseDirectoryParams({ q: ['a', 'b'] }).q).toBe('a');
  });
});

describe('directoryHref', () => {
  it('builds clean URLs and resets the page when a filter changes', () => {
    expect(directoryHref('/directory', { q: 'ali', halaman: 3 }, { qiraat: ID })).toBe(`/directory?q=ali&qiraat=${ID}`);
    expect(directoryHref('/directory', { q: 'ali' }, { halaman: 2 })).toBe('/directory?q=ali&halaman=2');
    expect(directoryHref('/directory', { halaman: 1 })).toBe('/directory');
  });
});

describe('helpers', () => {
  it('computes page counts', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25, 12)).toBe(3);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
