import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlowRunner } from './FlowRunner';

describe('Workflow: Check-your-answers navigation', () => {
  it('allows user to navigate through sign-up, review answers, change a step and return to review', () => {
    render(<FlowRunner flowId="signup" lang="en" />);

    // Step 1: Welcome
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign up to learn with us');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: Consent
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How we use your answers');
    const consentCheckbox = screen.getByRole('checkbox');
    fireEvent.click(consentCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: Full name
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is your full name?');
    const nameInput = screen.getByRole('textbox');
    fireEvent.change(nameInput, { target: { value: 'Abebe Bikila' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4: Preferred name (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What should we call you?');
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

    // Step 5: Contact method
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How can we reach you?');
    // Choose "Through an organisation that helps me" (partner) -> bypasses phone to dob
    const partnerRadio = screen.getByLabelText('Through an organisation that helps me');
    fireEvent.click(partnerRadio);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 6: Date of birth (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('When were you born?');
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

    // Step 7: ID route
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Which of these do you have?',
    );
    const faydaRadio = screen.getByLabelText('Fayda (national ID)');
    fireEvent.click(faydaRadio);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 8: Last 4 digits (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What are the last 4 numbers on it?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

    // Step 9: Support needs (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What would help you?');
    const screenReaderCheck = screen.getByLabelText(
      'I use a screen reader or need things read aloud',
    );
    fireEvent.click(screenReaderCheck);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 10: Support other (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Is there anything else that would help?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

    // Step 11: Support share (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Who can see what would help you?',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

    // Step 12: Check your answers!
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your answers');
    expect(screen.getByText('Abebe Bikila')).toBeInTheDocument();

    // Click "Change" on full name
    const changeButtons = screen.getAllByRole('button', { name: /Change/i });
    fireEvent.click(changeButtons[0]);

    // Back on full name step
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is your full name?');
    const nameEditInput = screen.getByRole('textbox');
    fireEvent.change(nameEditInput, { target: { value: 'Abebe Kebede Bikila' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Directly returned to Check your answers!
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your answers');
    expect(screen.getByText('Abebe Kebede Bikila')).toBeInTheDocument();

    // Final submit
    fireEvent.click(screen.getByRole('button', { name: 'Send my answers' }));

    // Done screen
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You are signed up');
  });
});

describe('Workflow: Job Application flow', () => {
  it('runs job-application flow: confirm contact, motivation, start date, attach support, check, done', () => {
    render(<FlowRunner flowId="job-application" lang="en" />);

    // Step 1: Contact confirm
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Are these contact details right?',
    );
    const yesRadio = screen.getByLabelText('Yes');
    fireEvent.click(yesRadio);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: Motivation
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Why do you want this job?',
    );
    const motivationInput = screen.getByRole('textbox');
    fireEvent.change(motivationInput, {
      target: { value: 'I have experience in accessible testing and want to contribute.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: Start date
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('When can you start?');
    // Fill day, month, year
    const dayInput = screen.getByLabelText('Day');
    const monthSelect = screen.getByLabelText('Month');
    const yearInput = screen.getByLabelText('Year');

    fireEvent.change(dayInput, { target: { value: '15' } });
    fireEvent.change(monthSelect, { target: { value: '1' } });
    fireEvent.change(yearInput, { target: { value: '2020' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4: Attach support
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Do you want to share what would help you with this employer?',
    );
    const attachNo = screen.getByLabelText('No');
    fireEvent.click(attachNo);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 5: Check application
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your application');
    fireEvent.click(screen.getByRole('button', { name: 'Send my application' }));

    // Step 6: Done
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Your application was sent',
    );
  });
});

describe('Workflow: Employer Job Form', () => {
  it('creates job, selects accommodations, reviews, and publishes', () => {
    render(<FlowRunner flowId="employer-job" lang="en" />);

    // Title
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is the job title?');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Accessibility Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Description
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Describe the job');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Develop and audit WCAG AA compliant user interfaces.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Location type
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Where will the person work?',
    );
    fireEvent.click(screen.getByLabelText('From home')); // remote skips location_text to work_hours
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Work hours (optional)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What are the working hours?',
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Flexible 40 hours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Employment type
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What kind of job is it?');
    fireEvent.click(screen.getByLabelText('Full time'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Accommodations offered
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Which supports does this job offer?',
    );
    fireEvent.click(screen.getByLabelText('Tools and documents work with screen readers'));
    fireEvent.click(screen.getByLabelText('Remote work'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Check answers
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check the job');
    fireEvent.click(screen.getByRole('button', { name: 'Publish the job' }));

    // Done screen. (The JobPosting JSON-LD box is added by the staff app after a real publish.)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The job is published');
  });
});
