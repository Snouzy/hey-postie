import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import licenses from '../data/licenses.json';
import { renderWithCore, setupCore } from '../test-utils';
import { filterLicenses, groupByLicense, Licenses } from './Licenses';

function open() {
  const { core } = setupCore();
  const onOpenLink = vi.fn();
  renderWithCore(<Licenses onClose={() => {}} onOpenLink={onOpenLink} />, core);
  return { onOpenLink };
}

describe('Licenses', () => {
  it('lists every license group, with the engine and the fonts in place', () => {
    open();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(
      [...new Set(licenses.map((entry) => entry.license))].sort((a, b) => a.localeCompare(b)),
    );
    expect(
      within(screen.getByRole('region', { name: 'MPL-2.0' })).getByText('@converse/headless'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'OFL-1.1' })).getByText('Fraunces'),
    ).toBeInTheDocument();
  });

  it('filters by name or by license, and says when nothing matches', () => {
    open();
    const search = screen.getByRole('searchbox', { name: /Search/ });
    fireEvent.change(search, { target: { value: 'react' } });
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('react-dom')).toBeInTheDocument();
    expect(screen.queryByText('strophe.js')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'ofl' } });
    expect(screen.getByText('Fraunces')).toBeInTheDocument();
    expect(screen.queryByText('react')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nothing-here' } });
    expect(screen.getByText(/Nothing in my satchel/)).toBeInTheDocument();
  });

  it('routes a repository link through onOpenLink', () => {
    const { onOpenLink } = open();
    fireEvent.click(screen.getByRole('link', { name: '@converse/headless' }));
    expect(onOpenLink).toHaveBeenCalledWith('https://github.com/conversejs/converse.js');
  });

  it('groups by license and sorts names inside each group', () => {
    const grouped = groupByLicense([
      { name: 'b', version: '1', license: 'MIT' },
      { name: 'z', version: '1', license: 'ISC' },
      { name: 'a', version: '1', license: 'MIT' },
    ]);
    expect(grouped.map(([license, entries]) => [license, entries.map((e) => e.name)])).toEqual([
      ['ISC', ['z']],
      ['MIT', ['a', 'b']],
    ]);
    expect(filterLicenses(licenses, '  ')).toEqual(licenses);
  });
});
