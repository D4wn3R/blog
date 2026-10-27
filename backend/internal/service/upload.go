package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os/exec"
	"time"

	"github.com/google/uuid"
)

// UploadService 图片上传子服务（#U1）：multipart 中转 → 校验/转码 → 服务端写桶。
// 原图字节过一道后端：换来同步报错与格式确定性（jpeg/png 统一转 WebP），
// 替代已退役的 presign 直传（D-upload-transcode）
type UploadService struct {
	svc *Service
	// transcode jpeg/png 原始字节 → WebP 字节（默认 cwebp 外部命令）；测试注入 fake
	transcode func(ctx context.Context, src []byte) ([]byte, error)
	// put 对象写入（默认 RustFS.PutObject）；测试注入 fake
	put func(ctx context.Context, objectKey, contentType string, data []byte) error
}

// _maxImageSize 原始图片大小上限 5 MiB（D-upload-size；服务端按真实字节校验，非客户端自报）
const _maxImageSize = 5 * 1024 * 1024

// errInvalidImage 图片内容无法解码（损坏/截断/伪装）：由转码分支映射为 400
var errInvalidImage = errors.New("invalid image")

// UploadDTO #U1 响应
type UploadDTO struct {
	PublicURL string `json:"public_url"` // 引用地址，相对路径 /files/{object_key}
	ObjectKey string `json:"object_key"` // 桶内对象键（B 端展示/排查用）
}

// Upload 接收原始图片字节：魔数嗅探（不信任客户端 MIME/文件名）分派分支：
// jpeg/png/bmp/tiff → 转 WebP（q80）；webp/gif → 原样入桶（webp 不二次压损，
// gif 保动画 D1）；其他一律 400。TIFF 魔数不在 Go 标准嗅探表内，由 sniffTIFF 补齐。
// 对象键 {yyyyMM}/{uuid}.{ext}：月份取服务端当前时间，
// uuid 为 crypto/rand 随机的 UUID v4，扩展名只由嗅探结果决定（防路径穿越与覆盖）
func (s *UploadService) Upload(ctx context.Context, src io.Reader) (*UploadDTO, error) {
	data, err := io.ReadAll(io.LimitReader(src, _maxImageSize+1))
	if err != nil {
		return nil, errServer(err)
	}
	if len(data) > _maxImageSize {
		return nil, errBadRequest("图片大小不能超过 5MiB")
	}

	var contentType, ext string
	switch sniffImageType(data) {
	case "image/jpeg", "image/png", "image/bmp", "image/tiff":
		if data, err = s.transcode(ctx, data); err != nil {
			if errors.Is(err, errInvalidImage) {
				return nil, errBadRequest("不支持的图片内容")
			}
			return nil, errServer(err)
		}
		contentType, ext = "image/webp", ".webp"
	case "image/webp":
		contentType, ext = "image/webp", ".webp"
	case "image/gif":
		contentType, ext = "image/gif", ".gif"
	default:
		return nil, errBadRequest("不支持的图片内容")
	}

	objectKey := time.Now().Format("200601") + "/" + uuid.NewString() + ext
	if err := s.put(ctx, objectKey, contentType, data); err != nil {
		return nil, errServer(err)
	}
	return &UploadDTO{
		PublicURL: "/files/" + objectKey,
		ObjectKey: objectKey,
	}, nil
}

// _tiffMagicLE/_tiffMagicBE TIFF 魔数（小端 II*、大端 MM*）：Go 标准嗅探表不含 TIFF，手动补齐
var (
	_tiffMagicLE = []byte("II*\x00")
	_tiffMagicBE = []byte("MM\x00*")
)

// sniffImageType 图片内容类型嗅探：在标准库魔数表基础上补 TIFF；
// 嗅探结果决定转码分支与入桶扩展名，客户端自报 MIME 一律不信任
func sniffImageType(data []byte) string {
	if bytes.HasPrefix(data, _tiffMagicLE) || bytes.HasPrefix(data, _tiffMagicBE) {
		return "image/tiff"
	}
	return http.DetectContentType(data)
}

// transcodeFFmpeg 调外部 ffmpeg（alpine 运行镜像的 ffmpeg 包）编码 WebP。
// stdin/stdout 管道直通，无临时文件；-q:v 质量映射 libwebp q80。
// ffmpeg 解码时应用 EXIF orientation，竖图输出即物理旋转（不再依赖阅读端处理）。
// 命令缺失属部署缺陷（500），解码失败按输入内容问题处理（errInvalidImage → 400）
func transcodeFFmpeg(ctx context.Context, src []byte) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-nostdin", "-loglevel", "error",
		"-i", "pipe:0",
		"-c:v", "libwebp", "-q:v", "80",
		"-f", "image2", "-frames:v", "1",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(src)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return nil, errServer(err)
		}
		return nil, errInvalidImage
	}
	if out.Len() == 0 {
		return nil, errInvalidImage
	}
	return out.Bytes(), nil
}
