import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from '../api/client';
import * as regApi from '../api/registrations';
import { ResumeScreen } from './ResumeScreen';

const mockApi: ApiConfig = {
  origin: 'http://localhost:8080',
  partnerKey: 'pk_test',
};

describe('ResumeScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders stage 1 (code) initially', () => {
    render(<ResumeScreen api={mockApi} lang="en" onSuccess={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Continue on another device' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Resume code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('validates required code input', async () => {
    render(<ResumeScreen api={mockApi} lang="en" onSuccess={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(submitBtn);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('looks up valid code and transitions to verification stage (phone)', async () => {
    vi.spyOn(regApi, 'resumeLookup').mockResolvedValue({
      registration_id: 'reg-123',
      check: 'phone',
    });

    render(<ResumeScreen api={mockApi} lang="en" onSuccess={vi.fn()} />);

    const input = screen.getByLabelText('Resume code');
    fireEvent.change(input, { target: { value: 'K7M-9P2' } });

    const submitBtn = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirm your identity' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Last 4 digits of phone')).toBeInTheDocument();
  });

  it('verifies phone last 4 and calls onSuccess', async () => {
    vi.spyOn(regApi, 'resumeLookup').mockResolvedValue({
      registration_id: 'reg-123',
      check: 'phone',
    });

    vi.spyOn(regApi, 'resumeVerify').mockResolvedValue({
      registration_id: 'reg-123',
      session: {
        token: 'token-learner-abc',
        expires_at: '2026-11-20T00:00:00Z',
      },
    });

    const onSuccess = vi.fn();
    render(<ResumeScreen api={mockApi} lang="en" onSuccess={onSuccess} />);

    // Step 1: Submit code
    const input = screen.getByLabelText('Resume code');
    fireEvent.change(input, { target: { value: 'K7M9P2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: Enter last 4 digits
    const phoneInput = await screen.findByLabelText('Last 4 digits of phone');
    fireEvent.change(phoneInput, { target: { value: '1234' } });

    const verifyBtn = screen.getByRole('button', { name: 'Verify and continue' });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        token: 'token-learner-abc',
        registrationId: 'reg-123',
      });
    });
  });

  it('allows returning to stage 1 via back button', async () => {
    vi.spyOn(regApi, 'resumeLookup').mockResolvedValue({
      registration_id: 'reg-123',
      check: 'phone',
    });

    render(<ResumeScreen api={mockApi} lang="en" onSuccess={vi.fn()} />);

    const input = screen.getByLabelText('Resume code');
    fireEvent.change(input, { target: { value: 'K7M9P2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const backBtn = await screen.findByRole('button', { name: 'Use a different code' });
    fireEvent.click(backBtn);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Continue on another device' }),
    ).toBeInTheDocument();
  });
});
