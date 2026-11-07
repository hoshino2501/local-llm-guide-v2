.PHONY: dev dev-mock test build plan deploy-backend deploy-web smoke
dev-mock: ; cd backend && npm run dev:mock
dev:      ; cd backend && npm run dev
test:     ; cd backend && npm run typecheck && npm test
build:    ; cd backend && npm run build
plan:     build ; cd infra/terraform && terraform plan
deploy-backend: ; scripts/deploy-backend.sh
deploy-web: ; scripts/deploy-web.sh
smoke: ; scripts/smoke-test.sh
