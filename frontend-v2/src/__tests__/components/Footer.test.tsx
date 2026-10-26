import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Footer } from '@/components/Footer';

jest.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
}));

// Mock Next.js routing
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));
import { usePathname } from 'next/navigation';

describe('Footer Component', () => {
  it('renders correctly on landing page with giant typography', () => {
    jest.mocked(usePathname).mockReturnValue('/');

    const { container } = render(<Footer />);

    // Check for logo text or trademark
    expect(screen.getByText(/© 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy', exact: true })).toBeInTheDocument();
    expect(container.querySelector('#giant')).toBeInTheDocument();
  });

  it('renders standard footer without giant typography on non-landing pages', () => {
    jest.mocked(usePathname).mockReturnValue('/contests');

    const { container } = render(<Footer />);

    expect(screen.getByText(/© 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy', exact: true })).toBeInTheDocument();
    expect(container.querySelector('#giant')).not.toBeInTheDocument();
  });

  it('hides the footer on workspace/editor pages', () => {
    jest.mocked(usePathname).mockReturnValue('/problems/two-sum');

    const { container } = render(<Footer />);

    // It should render null (nothing)
    expect(container.firstChild).toBeNull();
  });
});

it('hides the footer on the contest attempt workspace', () => {
  jest.mocked(usePathname).mockReturnValue('/contests/contest-id/attempt');
  const { container } = render(<Footer />);
  expect(container.firstChild).toBeNull();
});
