.PHONY: build test lint fmt migrate tidy

# CGO_ENABLED=0 静态编译
build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/server ./cmd/server

test:
	go test -race ./...

lint:
	golangci-lint run

fmt:
	gofumpt -w -l .

# 幂等建表 + seed 管理员（需 MySQL 在线）
migrate:
	go run ./cmd/server -migrate

tidy:
	go mod tidy
