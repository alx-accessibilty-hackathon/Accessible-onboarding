import { describe, it } from 'vitest';

// FA-2: turn these into real tests as you build the engine (next.ts, validate.ts, reducer.ts).
describe('form engine', () => {
  it.todo('contact_method phone or telegram goes to phone; partner or none goes to dob');
  it.todo(
    'id_route none goes to referral_partner; other_document to id_doc_type; others to id_last4',
  );
  it.todo('Continue on a required empty step returns the "required" error code');
  it.todo('phone_et accepts 09…, 07…, +2519…, +2517… with or without spaces');
  it.todo('Back returns to the previous step in the history, not the previous step in the file');
  it.todo('a Change link from Check your answers returns to Check your answers after Continue');
  it.todo('progress counts only input steps on the current path');
});
