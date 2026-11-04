import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_DESCRIPTION } from './index';

describe('Swatchwell shared package', () => {
  it('exports the correct application name', () => {
    expect(APP_NAME).toBe('Swatchwell');
  });

  it('exports an application description', () => {
    expect(APP_DESCRIPTION).toBe(
      'Your personal color styling assistant'
    );
  });
});
