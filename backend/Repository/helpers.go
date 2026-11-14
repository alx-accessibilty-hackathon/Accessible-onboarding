package repository

// Small helpers for mapping generated sqlc rows to domain entities.

// deref returns the value behind a pointer, or the zero value for nil
// (sqlc makes nullable columns pointers).
func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
