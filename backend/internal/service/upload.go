package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
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
// jpeg/png → 转 WebP（q80）；webp/gif → 原样入桶（webp 不二次压损，gif 保动画 D1）；
// 其他一律 400。对象键 {yyyyMM}/{uuid}.{ext}：月份取服务端当前时间，
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
	switch http.DetectContentType(data) {
	case "image/jpeg", "image/png":
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

// transcodeCWebP 调外部 cwebp（alpine 运行镜像的 libwebp-tools 包）编码 WebP。
// cwebp 不支持 stdin/stdout，走临时文件中转：文件名由服务端随机生成，无路径注入面；
// 格式由 cwebp 按魔数自嗅探，扩展名无关；-metadata exif 保留拍摄方向信息（手机竖图）。
// 命令缺失属部署缺陷（503），编码失败按输入内容问题处理（400）
func transcodeCWebP(ctx context.Context, src []byte) ([]byte, error) {
	in, err := os.CreateTemp("", "upload-*.img")
	if err != nil {
		return nil, errServer(err)
	}
	tmpIn := in.Name()
	tmpOut := tmpIn + ".webp"
	defer func() {
		_ = in.Close()        // 主流程已显式 Close，此处兜底，失败无需处理
		_ = os.Remove(tmpIn)  // 临时文件清理，失败无需处理
		_ = os.Remove(tmpOut) // 同上
	}()

	if _, err = in.Write(src); err != nil {
		return nil, errServer(err)
	}
	if err = in.Close(); err != nil {
		return nil, errServer(err)
	}

	cmd := exec.CommandContext(ctx, "cwebp", "-quiet", "-q", "80", "-metadata", "exif", tmpIn, "-o", tmpOut)
	if err := cmd.Run(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return nil, errServer(err)
		}
		return nil, errInvalidImage
	}
	data, err := os.ReadFile(tmpOut)
	if err != nil || len(data) == 0 {
		return nil, errInvalidImage
	}
	return data, nil
}
