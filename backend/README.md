# Backend (Go)

Clean architecture, using the same layout as the G6-WorryMate backend. Gin for HTTP, PostgreSQL (pgx) for data.

## Layout

```text
backend/
├── main.go                  wires everything: repositories → use cases → controllers → router
├── Domain/
│   ├── entities.go          plain structs and shared values (no JSON tags, no database code)
│   └── interfaces.go        use case, repository and service interfaces
├── Usecase/                 business rules and permission checks; depends only on Domain interfaces
├── Repository/              PostgreSQL code (db.go connects; one file per table group)
├── Infrastructure/          middleware and outside services (security, speech-to-text, SMS)
├── Delivery/
│   ├── Controllers/         HTTP handlers + request/response DTOs (<area>_dto.go)
│   ├── Routers/router.go    every route in one place
│   └── mocks/               generated mocks for tests (mockery)
└── migrations/              SQL migration files
```

**Dependency rule:** Controllers → Usecase → Domain ← Repository / Infrastructure. A use case never imports `gin` or `pgx`.

## Run

```bash
cp .env.example .env          # fill in DATABASE_URL and the keys
go run .                      # http://localhost:8080/health
go test ./...
```

Use Go 1.24. If `go get` tries to download a newer toolchain, run it with `GOTOOLCHAIN=local`.

## Adding an endpoint

1. **Domain:** add the method to the interface in `interfaces.go`, and any new entity to `entities.go`.
2. **Repository:** implement the database method.
3. **Usecase:** implement the rule, including the permission check.
4. **Controller:** bind the DTO, call the use case, return JSON (errors use `ErrorResponse`).
5. **Router:** the route already exists for Must endpoints; it returns 501 until step 4 is done.
6. **Test:** regenerate the mocks and write the use case and controller tests.

   ```bash
   mockery --dir Domain --all --output Delivery/mocks
   ```

7. **Contract:** add the endpoint, with an example, to `../api/openapi.yaml`.

## Status

Skeleton only. Every handler answers `501 not_implemented`, every middleware lets requests through, and the interfaces are empty. The endpoint list is in `TECHNICAL_PLAN_LITE.md`.
