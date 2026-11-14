import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { LinkButton } from './LinkButton';
import { VisuallyHidden } from './VisuallyHidden';

describe('Base Components', () => {
  it('renders Button with primary and secondary variants', () => {
    const { rerender } = render(<Button variant="primary">Continue</Button>);
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('bo-btn-primary');

    rerender(<Button variant="secondary">Back</Button>);
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('bo-btn-secondary');
  });

  it('renders LinkButton with proper href and classes', () => {
    render(
      <LinkButton href="/jobs" variant="primary">
        Browse Jobs
      </LinkButton>,
    );
    const link = screen.getByRole('link', { name: 'Browse Jobs' });
    expect(link).toHaveAttribute('href', '/jobs');
    expect(link).toHaveClass('bo-btn-primary');
    expect(link).toHaveClass('bo-link-btn');
  });

  it('renders Card with surface styling and children', () => {
    render(
      <Card data-testid="test-card">
        <p>Card Content</p>
      </Card>,
    );
    const card = screen.getByTestId('test-card');
    expect(card).toHaveClass('bo-card');
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('renders Icon with accessible SVG path and aria attributes', () => {
    render(<Icon name="check_circle" label="Success icon" data-testid="icon" />);
    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('role', 'img');
    expect(icon).toHaveAttribute('aria-label', 'Success icon');
  });

  it('renders VisuallyHidden accessible to screen readers with bo-visually-hidden class', () => {
    render(<VisuallyHidden>Screen reader note</VisuallyHidden>);
    const hidden = screen.getByText('Screen reader note');
    expect(hidden).toHaveClass('bo-visually-hidden');
  });

  it('renders Banner with alert/status roles and dismiss button', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Banner variant="error" onDismiss={onDismiss}>
        Something failed
      </Banner>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(<Banner variant="success">Saved</Banner>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders Dialog, manages showModal, close, and title', () => {
    // Mock HTMLDialogElement methods in jsdom if not natively implemented
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });

    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open={true} onClose={onClose} title="Test Modal">
        <p>Modal body</p>
      </Dialog>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Test Modal' })).toBeInTheDocument();
    expect(screen.getByText('Modal body')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();

    rerender(
      <Dialog open={false} onClose={onClose} title="Test Modal">
        <p>Modal body</p>
      </Dialog>,
    );
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
  });
});
