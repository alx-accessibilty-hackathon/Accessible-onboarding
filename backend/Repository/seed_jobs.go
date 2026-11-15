package repository

import (
	"context"
	"fmt"

	sqlc "bridge/Repository/sqlc"

	"github.com/google/uuid"
)

// SeedJobs adds 6 published demo jobs for one employer (A5). Their accommodations overlap
// in different ways, so the job filter shows full matches, partial matches and non-matches
// for the same learner. Dev B's Seed calls it after creating the "Example Co" employer
// (pass the transaction's queries, q := sqlc.New(tx), so the seed is all-or-nothing).
func SeedJobs(ctx context.Context, q *sqlc.Queries, employerID uuid.UUID) error {
	for _, j := range demoJobs {
		created, err := q.CreateJob(ctx, sqlc.CreateJobParams{
			EmployerID:     &employerID,
			Source:         "local",
			Title:          j.title,
			Description:    j.description,
			LocationType:   j.locationType,
			LocationText:   nilIfEmpty(j.locationText),
			WorkHours:      nilIfEmpty(j.workHours),
			EmploymentType: j.employmentType,
			Accommodations: j.accommodations,
		})
		if err != nil {
			return fmt.Errorf("seed job %q: %w", j.title, err)
		}
		if _, err := q.PublishJob(ctx, sqlc.PublishJobParams{ID: created.ID, EmployerID: &employerID}); err != nil {
			return fmt.Errorf("publish seed job %q: %w", j.title, err)
		}
	}
	return nil
}

type demoJob struct {
	title, description, locationType, locationText, workHours, employmentType string
	accommodations                                                            []string
}

var demoJobs = []demoJob{
	{
		title:          "Junior Data Analyst",
		description:    "Clean and report data for our training programmes. You will update spreadsheets, check numbers and write a short weekly summary.",
		locationType:   "hybrid",
		locationText:   "Addis Ababa",
		workHours:      "Mon–Fri, 9:00–17:00",
		employmentType: "full_time",
		accommodations: []string{"flexible_hours", "screen_reader", "remote_work"},
	},
	{
		title:          "Customer Support Agent (phone and chat)",
		description:    "Answer questions from learners by phone and chat. Training is given in the first two weeks. You can work from home.",
		locationType:   "remote",
		workHours:      "Part time, 4 hours a day; you choose morning or afternoon",
		employmentType: "part_time",
		accommodations: []string{"remote_work", "flexible_hours", "own_device", "written_instructions"},
	},
	{
		title:          "Junior Web Developer",
		description:    "Build and fix pages on our websites with HTML, CSS and JavaScript. A senior developer reviews your work every day.",
		locationType:   "remote",
		workHours:      "Mon–Fri, flexible hours",
		employmentType: "full_time",
		accommodations: []string{"remote_work", "screen_reader", "large_text", "own_device", "flexible_hours"},
	},
	{
		title:          "Administrative Assistant",
		description:    "Welcome visitors, answer the phone, file documents and book meeting rooms in our ground-floor office.",
		locationType:   "onsite",
		locationText:   "Bole, Addis Ababa",
		workHours:      "Mon–Fri, 8:30–17:00",
		employmentType: "full_time",
		accommodations: []string{"step_free", "accessible_toilet", "quiet_space"},
	},
	{
		title:          "Graphic Design Intern",
		description:    "Make posters and social media images for our courses. Six-month internship with a mentor.",
		locationType:   "hybrid",
		locationText:   "Hawassa",
		workHours:      "Mon–Thu, 9:00–15:00",
		employmentType: "internship",
		accommodations: []string{"captions", "sign_language", "written_instructions", "extra_time", "person_to_help"},
	},
	{
		title:          "Data Entry Clerk",
		description:    "Type paper forms into our computer system and check them for mistakes. Three-month contract.",
		locationType:   "onsite",
		locationText:   "Adama",
		workHours:      "Mon–Fri, 9:00–16:00",
		employmentType: "contract",
		accommodations: []string{"step_free", "large_text", "extra_time", "quiet_space"},
	},
}
