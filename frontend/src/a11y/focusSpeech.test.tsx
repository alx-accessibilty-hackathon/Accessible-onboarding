import { render, screen, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocusSpeech } from './focusSpeech';
import * as speaker from './speaker';

function TestComponent({
  standalonePressed = false,
  groupPressed = false,
}: {
  standalonePressed?: boolean;
  groupPressed?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusSpeech(rootRef, 'en', true);

  return (
    <div ref={rootRef}>
      {/* Standalone toggle button */}
      <button type="button" aria-pressed={standalonePressed}>
        Simple mode
      </button>

      {/* Button inside a role="group" */}
      <div role="group" aria-label="Calendar">
        <button type="button" aria-pressed={groupPressed}>
          Ethiopian calendar
        </button>
      </div>
    </div>
  );
}

describe('focusSpeech toggle buttons', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it('speaks toggled state at once (interrupt) when clicking a standalone toggle button', async () => {
    const speakSpy = vi.spyOn(speaker, 'speak').mockResolvedValue(true);
    const { rerender } = render(<TestComponent standalonePressed={false} />);

    const button = screen.getByRole('button', { name: 'Simple mode' });

    // Click button to toggle on
    fireEvent.click(button);

    // Simulate state update in parent rerendering the button with aria-pressed="true"
    rerender(<TestComponent standalonePressed={true} />);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(speakSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Simple mode' }),
        expect.objectContaining({ text: 'on' }),
      ]),
      'en',
      { interrupt: true },
    );
  });

  it('speaks toggled state "off" when clicking a standalone toggle button that is now off', async () => {
    const speakSpy = vi.spyOn(speaker, 'speak').mockResolvedValue(true);
    const { rerender } = render(<TestComponent standalonePressed={true} />);

    const button = screen.getByRole('button', { name: 'Simple mode' });

    // Click button to toggle off
    fireEvent.click(button);

    // Parent rerenders with aria-pressed="false"
    rerender(<TestComponent standalonePressed={false} />);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(speakSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Simple mode' }),
        expect.objectContaining({ text: 'off' }),
      ]),
      'en',
      { interrupt: true },
    );
  });

  it('speaks selected prefix with low:true when clicking a group button that is selected', async () => {
    const speakSpy = vi.spyOn(speaker, 'speak').mockResolvedValue(true);
    const { rerender } = render(<TestComponent groupPressed={false} />);

    const button = screen.getByRole('button', { name: 'Ethiopian calendar' });

    fireEvent.click(button);

    // Parent rerenders with aria-pressed="true"
    rerender(<TestComponent groupPressed={true} />);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(speakSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Selected' }),
        expect.objectContaining({ text: 'Ethiopian calendar' }),
      ]),
      'en',
      { low: true },
    );
  });

  it('does not speak when clicking a group button if it becomes unpressed', async () => {
    const speakSpy = vi.spyOn(speaker, 'speak').mockResolvedValue(true);
    const { rerender } = render(<TestComponent groupPressed={true} />);

    const button = screen.getByRole('button', { name: 'Ethiopian calendar' });

    fireEvent.click(button);

    rerender(<TestComponent groupPressed={false} />);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(speakSpy).not.toHaveBeenCalled();
  });
});
