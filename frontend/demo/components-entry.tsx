import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../src/widget/styles.css';
import { Card } from '../src/components/Card';
import { Icon } from '../src/components/Icon';
import { LinkButton } from '../src/components/LinkButton';
import { Banner } from '../src/components/Banner';
import { Dialog } from '../src/components/Dialog';
import { Button } from '../src/components/Button';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2em' }}>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', marginTop: '0.75em' }}>
        {children}
      </div>
    </section>
  );
}

function Demo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(true);
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [showSuccessBanner, setShowSuccessBanner] = useState(true);

  return (
    <div className="bo-root">
      <div className="bo-frame">
        <h1>Component Demo</h1>

        {/* Card */}
        <Section title="Card">
          <Card>
            <p style={{ margin: 0 }}>A basic surface card with default padding and background.</p>
          </Card>
          <Card>
            <h3 style={{ margin: '0 0 0.5em' }}>Card with heading</h3>
            <p style={{ margin: 0 }}>Cards hold any content: forms, text, actions.</p>
          </Card>
        </Section>

        {/* Icon */}
        <Section title="Icon">
          <div style={{ display: 'flex', gap: '1em', alignItems: 'center' }}>
            <Icon name="check_circle" label="Success" />
            <Icon name="error" label="Error" />
            <Icon name="info" label="Information" />
            <Icon name="close" label="Close" />
            <Icon name="search" label="Search" />
            <Icon name="person" label="Person" />
          </div>
          <p className="bo-hint">
            Decorative icon (aria-hidden): <Icon name="star" />
          </p>
        </Section>

        {/* LinkButton */}
        <Section title="LinkButton">
          <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
            <LinkButton href="#primary" variant="primary">
              Primary link
            </LinkButton>
            <LinkButton href="#secondary" variant="secondary">
              Secondary link
            </LinkButton>
          </div>
        </Section>

        {/* Banner */}
        <Section title="Banner">
          {showErrorBanner && (
            <Banner variant="error" onDismiss={() => setShowErrorBanner(false)}>
              Something went wrong. Please try again.
            </Banner>
          )}
          {showInfoBanner && (
            <Banner variant="info" onDismiss={() => setShowInfoBanner(false)}>
              Your application has been received.
            </Banner>
          )}
          {showSuccessBanner && (
            <Banner variant="success" onDismiss={() => setShowSuccessBanner(false)}>
              Profile saved successfully!
            </Banner>
          )}
          {!showErrorBanner && !showInfoBanner && !showSuccessBanner && (
            <p className="bo-hint">
              All banners dismissed.{' '}
              <button
                type="button"
                className="bo-link"
                onClick={() => {
                  setShowErrorBanner(true);
                  setShowInfoBanner(true);
                  setShowSuccessBanner(true);
                }}
              >
                Reset
              </button>
            </p>
          )}
        </Section>

        {/* Dialog */}
        <Section title="Dialog">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Example Dialog">
            <p style={{ margin: '0 0 1em' }}>
              This dialog uses the native <code>&lt;dialog&gt;</code> element. It traps focus,
              handles Escape, and returns focus to the opener on close.
            </p>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
          </Dialog>
        </Section>

        {/* Button states */}
        <Section title="Button States">
          <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
            <Button variant="primary">Normal</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="primary" className="bo-btn-loading" aria-busy="true">
              Loading
            </Button>
          </div>
          <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
            <Button variant="secondary">Normal</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button variant="secondary" className="bo-btn-loading" aria-busy="true">
              Loading
            </Button>
          </div>
        </Section>

        {/* Form inputs */}
        <Section title="Form Inputs">
          <label>
            <span>Text input</span>
            <input type="text" className="bo-input" placeholder="Your full name" />
          </label>
          <label>
            <span>Phone input</span>
            <input type="tel" className="bo-input" placeholder="+251 900 000 000" />
          </label>
          <label>
            <span>Error state</span>
            <input type="text" className="bo-input" aria-invalid="true" defaultValue="bad value" />
          </label>
          <label>
            <span>Textarea</span>
            <textarea className="bo-textarea" placeholder="Tell us about yourself…" rows={3} />
          </label>
        </Section>

        {/* Checkbox + Radio */}
        <Section title="Checkbox &amp; Radio">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Select your interests:</legend>
            <label className="bo-checkbox">
              <input type="checkbox" /> Software engineering
            </label>
            <label className="bo-checkbox">
              <input type="checkbox" /> Data science
            </label>
            <label className="bo-checkbox">
              <input type="checkbox" /> Product design
            </label>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Preferred language:</legend>
            <label className="bo-radio">
              <input type="radio" name="lang" /> English
            </label>
            <label className="bo-radio">
              <input type="radio" name="lang" /> Amharic
            </label>
          </fieldset>
        </Section>
      </div>
    </div>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(<Demo />);
