import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as outbox from '../offline/outbox';
import * as onlineHook from '../offline/useOnline';
import { StatusBar } from './StatusBar';

describe('shell/StatusBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows saved to your account when online and outbox is empty', async () => {
    vi.spyOn(onlineHook, 'useOnline').mockReturnValue(true);
    vi.spyOn(outbox, 'pendingCount').mockResolvedValue(0);

    render(<StatusBar lang="en" registrationId="reg_1" />);
    expect(await screen.findByText('Saved online')).toBeInTheDocument();
  });

  it('shows saved on this phone only when online but outbox has pending items', async () => {
    vi.spyOn(onlineHook, 'useOnline').mockReturnValue(true);
    vi.spyOn(outbox, 'pendingCount').mockResolvedValue(2);

    render(<StatusBar lang="en" registrationId="reg_1" />);
    expect(await screen.findByText('Saved on this phone only')).toBeInTheDocument();
  });

  it('shows offline warning when browser reports offline', async () => {
    vi.spyOn(onlineHook, 'useOnline').mockReturnValue(false);

    render(<StatusBar lang="en" registrationId="reg_1" />);
    expect(
      screen.getByText('You are offline. Your answers are saved on this phone.'),
    ).toBeInTheDocument();
  });
});
