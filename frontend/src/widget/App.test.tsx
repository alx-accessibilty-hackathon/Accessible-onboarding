import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App (widget root)', () => {
  // The chosen language is remembered on the device: start each test without one.
  beforeEach(() => localStorage.clear());

  it('asks for the language first, then shows the first sign-up step as the page heading', () => {
    render(<App flow="signup" lang="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign up to learn with us');
  });

  it('mounts exactly one live region (W1)', () => {
    render(<App flow="signup" lang="en" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('sets lang and dir on its root', () => {
    const { container } = render(<App flow="signup" lang="am" />);
    const root = container.querySelector('.bo-root');
    expect(root).toHaveAttribute('lang', 'am');
    expect(root).toHaveAttribute('dir', 'ltr');
  });

  it('tells the host page it is ready', () => {
    const onReady = vi.fn();
    document.addEventListener('bridge-onboarding:ready', onReady);
    render(<App flow="signup" lang="en" />);
    expect(onReady).toHaveBeenCalledTimes(1);
    document.removeEventListener('bridge-onboarding:ready', onReady);
  });
});
