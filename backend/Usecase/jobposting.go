package usecase

import (
	"strings"

	domain "bridge/Domain"
)

// accommodationsNamespacePath is added to PUBLIC_WEB_URL to name our JSON-LD extension.
// schema.org has no property for workplace accommodations, so the codes go in "acc:offers".
const accommodationsNamespacePath = "/ns/accommodations#"

// schema.org employmentType values.
var schemaEmploymentType = map[string]string{
	"full_time":  "FULL_TIME",
	"part_time":  "PART_TIME",
	"contract":   "CONTRACTOR",
	"internship": "INTERN",
	"temporary":  "TEMPORARY",
}

// What each accommodation means, in English, for the readable "jobBenefits" text
// (the employer wording of TECHNICAL_PLAN.md 2.4). "other" is never offered by employers.
var accommodationBenefit = map[string]string{
	"screen_reader":        "tools and documents that work with screen readers",
	"large_text":           "screen magnification and large-print materials",
	"sign_language":        "a sign language interpreter for interviews and meetings",
	"captions":             "captions and written notes for meetings",
	"step_free":            "step-free building access",
	"accessible_toilet":    "an accessible toilet",
	"flexible_hours":       "flexible hours and breaks",
	"remote_work":          "remote work",
	"extra_time":           "extra time for tests and tasks",
	"written_instructions": "written, plain-language instructions",
	"quiet_space":          "a quiet workspace",
	"own_device":           "use of your own assistive device or software",
	"person_to_help":       "a named support person or mentor",
}

// BuildJobPosting turns a job into schema.org JobPosting JSON-LD (TECHNICAL_PLAN.md 5.8):
//   - the readable accommodations go in "jobBenefits", which every JobPosting reader understands
//   - the codes go in "acc:offers", our documented extension, so a machine can match them to needs
//   - "jobLocationType": "TELECOMMUTE" is added only for remote jobs
//
// accNamespace is the IRI of the "acc" prefix, e.g. https://bridge.example/ns/accommodations#.
func BuildJobPosting(job *domain.Job, employerName, accNamespace string) map[string]any {
	offers := make([]string, 0, len(job.Accommodations))
	benefits := make([]string, 0, len(job.Accommodations))
	for _, code := range job.Accommodations {
		text, ok := accommodationBenefit[code]
		if !ok {
			continue
		}
		offers = append(offers, code)
		benefits = append(benefits, text)
	}

	posting := map[string]any{
		"@context":           []any{"https://schema.org", map[string]any{"acc": accNamespace}},
		"@type":              "JobPosting",
		"title":              job.Title,
		"description":        job.Description,
		"hiringOrganization": map[string]any{"@type": "Organization", "name": employerName},
		"acc:offers":         offers,
	}
	if job.PublishedAt != nil {
		posting["datePosted"] = job.PublishedAt.UTC().Format("2006-01-02")
	}
	if t, ok := schemaEmploymentType[job.EmploymentType]; ok {
		posting["employmentType"] = t
	}
	if job.WorkHours != "" {
		posting["workHours"] = job.WorkHours
	}
	if len(benefits) > 0 {
		posting["jobBenefits"] = "Supports we offer: " + strings.Join(benefits, "; ") + "."
	}

	address := map[string]any{"@type": "PostalAddress", "addressCountry": "ET"}
	if job.LocationText != "" {
		address["addressLocality"] = job.LocationText
	}
	if job.LocationType == domain.LocationRemote {
		posting["jobLocationType"] = "TELECOMMUTE"
		// For remote jobs, search engines want to know where applicants may live.
		posting["applicantLocationRequirements"] = map[string]any{"@type": "Country", "name": "Ethiopia"}
		if job.LocationText != "" {
			posting["jobLocation"] = map[string]any{"@type": "Place", "address": address}
		}
	} else {
		posting["jobLocation"] = map[string]any{"@type": "Place", "address": address}
	}
	return posting
}
