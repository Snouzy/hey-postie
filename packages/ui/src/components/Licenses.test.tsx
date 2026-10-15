import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import licenses from '../data/licenses.json';
import { renderWithCore, setupCore } from '../test-utils';
import { filterLicenses, groupByLicense, type LicenseEntry, Licenses } from './Licenses';

function open(entries?: LicenseEntry[]) {
  const { core } = setupCore();
  const onOpenLink = vi.fn();
  renderWithCore(
    <Licenses onClose={() => {}} onOpenLink={onOpenLink} {...(entries ? { entries } : {})} />,
    core,
  );
  return { onOpenLink };
}

describe('Licenses', () => {
  it('lists every component under its license', () => {
    open();
    for (const entry of licenses) {
      const group = screen.getByRole('region', { name: entry.license });
      expect(within(group).getByText(entry.name)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(
      [...new Set(licenses.map((entry) => entry.license))].sort((a, b) => a.localeCompare(b)),
    );
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
    expect(screen.getAllByText(/Nothing in my satchel/)).toHaveLength(2); // visible + status
    expect(screen.getByRole('status')).toHaveTextContent(/Nothing in my satchel/);
  });

  it('announces how many components the search found', () => {
    open();
    expect(screen.getByRole('status')).toHaveTextContent(`${licenses.length} components listed`);
    fireEvent.change(screen.getByRole('searchbox', { name: /Search/ }), {
      target: { value: 'strophe' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 components listed');
  });

  it('lists two versions of one name as two rows, and links only https addresses', () => {
    open([
      { name: 'dup', version: '1.0.0', license: 'MIT', repository: 'https://example.org/dup' },
      { name: 'dup', version: '2.0.0', license: 'MIT', repository: 'git+ssh://example.org/dup' },
      { name: 'plain', version: '1', license: 'MIT' },
    ]);
    expect(screen.getAllByText('dup')).toHaveLength(2);
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.getByText('2.0.0')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'dup' })).toHaveAttribute(
      'href',
      'https://example.org/dup',
    );
  });

  it('routes a repository link through onOpenLink', () => {
    const { onOpenLink } = open();
    fireEvent.click(screen.getByRole('link', { name: 'react' }));
    expect(onOpenLink).toHaveBeenCalledWith('https://github.com/facebook/react');
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
