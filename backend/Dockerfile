# GOPROXY 走国内镜像（服务器直连 goproxy.cn）；海外 CI 用 build-arg 覆盖回官方代理
# 配置优先级：compose 环境变量 > 挂载的 .env（凭证兜底）> configs/config.yaml（缺省值）
FROM golang:1.26-alpine AS build
ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=${GOPROXY}
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/server ./server
COPY configs/config.yaml ./configs/config.yaml

# apk 源切国内镜像（官方 CDN 对部署机不稳定，同 GOPROXY 道理）；ca-certificates：OAuth 走
# HTTPS 调 GitHub API；ffmpeg：libwebp 编码器做图片转 WebP（支持 jpeg/png/bmp/tiff 输入）
RUN sed -i 's#https://dl-cdn.alpinelinux.org#https://mirrors.aliyun.com#g' /etc/apk/repositories \
	&& apk add --no-cache ca-certificates tzdata ffmpeg \
	&& cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 非 root 用户运行
RUN addgroup -S app && adduser -S -G app app
USER app

EXPOSE 8080

CMD ["sh", "-c", "/app/server -migrate && exec /app/server"]
