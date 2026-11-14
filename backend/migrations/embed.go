// Package migrations holds the goose migrations, embedded into the binary so
// `bridge migrate` works anywhere (Docker included) without the files on disk.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
