package domain

// Interfaces are empty on purpose: add methods as you implement each endpoint.
// Rule: use cases depend on these interfaces, never on Repository or Infrastructure types.

// ---- Use cases (called by controllers) ----

type ConfigUsecaseI interface{}       // GET /config
type RegistrationUsecaseI interface{} // registrations, answers, progress, submit
type SupportUsecaseI interface{}      // support request (encrypted)
type ConsentUsecaseI interface{}      // consents
type AuthUsecaseI interface{}         // logout, staff login, OAuth client credentials
type SpeechUsecaseI interface{}       // speech-to-text
type JobUsecaseI interface{}          // public jobs, JobPosting, employer jobs
type ApplicationUsecaseI interface{}  // job applications
type LearnerUsecaseI interface{}      // partner API learners (and later /me)

// ---- Repositories (implemented in Repository/) ----

type PartnerRepositoryI interface{}
type StaffRepositoryI interface{}
type LearnerRepositoryI interface{}
type RegistrationRepositoryI interface{} // registrations + answers
type SupportRepositoryI interface{}
type ConsentRepositoryI interface{}
type SessionRepositoryI interface{}
type JobRepositoryI interface{}
type ApplicationRepositoryI interface{}

// ---- Services (implemented in Infrastructure/) ----

type SecurityService interface{} // tokens, hashing, encryption, passwords
type SpeechService interface{}   // speech-to-text providers (mock, azure, local)
type MessageService interface{}  // SMS / Telegram (console provider for the demo)
