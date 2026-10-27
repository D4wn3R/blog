package service

// UploadService.Upload 分支单测：transcode/put 注入 fake，无 DB/RustFS 依赖；
// ffmpeg 真集成测试在本地或 CI（ffmpeg 包）可用时运行，缺失则跳过

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// 各格式魔数样本：嗅探分支以真实魔数驱动，不依赖 multipart 头
var (
	pngRaw    = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	jpegRaw   = append([]byte("\xff\xd8\xff\xe0"), bytes.Repeat([]byte{0}, 32)...)
	gifRaw    = append([]byte("GIF89a"), bytes.Repeat([]byte{0}, 32)...)
	webpRaw   = append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), bytes.Repeat([]byte{0}, 32)...)
	bmpRaw    = append([]byte("BM\x00\x00\x00\x00"), bytes.Repeat([]byte{0}, 32)...)
	tiffRaw   = append([]byte("II*\x00\x08\x00\x00\x00"), bytes.Repeat([]byte{0}, 32)...)
	tiffBERaw = append([]byte("MM\x00\x2a\x00\x00\x00\x08"), bytes.Repeat([]byte{0}, 32)...)
)

// putCall 记录一次 put 写入
type putCall struct {
	key         string
	contentType string
	data        []byte
}

// asServiceErr 断言 err 为 Error 并返回；非 Error 直接 Fatal
func asServiceErr(t *testing.T, err error) *Error {
	t.Helper()
	var se *Error
	if !errors.As(err, &se) {
		t.Fatalf("期望 Error，得到: %v", err)
	}
	return se
}

func TestUploadTranscodeFormatsToWebP(t *testing.T) {
	webpOut := append([]byte("RIFF\x00\x00\x00\x00WEBP"), bytes.Repeat([]byte{0xaa}, 16)...)
	for name, raw := range map[string][]byte{"jpeg": jpegRaw, "png": pngRaw, "bmp": bmpRaw, "tiff": tiffRaw} {
		var transcodeIn []byte
		transcodeCnt := 0
		var call putCall
		s := &UploadService{
			svc: &Service{},
			transcode: func(_ context.Context, src []byte) ([]byte, error) {
				transcodeCnt++
				transcodeIn = src
				return webpOut, nil
			},
			put: func(_ context.Context, key, ct string, data []byte) error {
				call = putCall{key, ct, data}
				return nil
			},
		}
		res, err := s.Upload(context.Background(), bytes.NewReader(raw))
		if err != nil {
			t.Fatalf("%s: Upload 失败: %v", name, err)
		}
		if transcodeCnt != 1 || !bytes.Equal(transcodeIn, raw) {
			t.Fatalf("%s: 应转码原图一次", name)
		}
		if call.contentType != "image/webp" || !strings.HasSuffix(call.key, ".webp") {
			t.Fatalf("%s: 落桶应为 image/webp/.webp，得到 %s/%s", name, call.contentType, call.key)
		}
		if !strings.HasPrefix(call.key, time.Now().Format("200601")+"/") {
			t.Fatalf("%s: 对象键应含 yyyyMM 前缀: %s", name, call.key)
		}
		if !bytes.Equal(call.data, webpOut) {
			t.Fatalf("%s: 落桶应为转码产物", name)
		}
		if res.PublicURL != "/files/"+res.ObjectKey || !strings.HasPrefix(res.PublicURL, "/files/") {
			t.Fatalf("%s: public_url 应为 /files/ 相对路径: %q", name, res.PublicURL)
		}
	}
}

func TestUploadWebPAndGIFKeptAsIs(t *testing.T) {
	cases := map[string]struct {
		raw         []byte
		contentType string
		ext         string
	}{
		"webp": {webpRaw, "image/webp", ".webp"},
		"gif":  {gifRaw, "image/gif", ".gif"},
	}
	for name, want := range cases {
		s := &UploadService{
			svc: &Service{},
			transcode: func(_ context.Context, _ []byte) ([]byte, error) {
				t.Fatalf("%s: 不应触发转码", name)
				return nil, nil
			},
			put: func(_ context.Context, key, ct string, data []byte) error {
				if ct != want.contentType || !strings.HasSuffix(key, want.ext) || !bytes.Equal(data, want.raw) {
					t.Fatalf("%s: 应原样落桶 %s/*%s，得到 %s/%s", name, want.contentType, want.ext, ct, key)
				}
				return nil
			},
		}
		if _, err := s.Upload(context.Background(), bytes.NewReader(want.raw)); err != nil {
			t.Fatalf("%s: Upload 失败: %v", name, err)
		}
	}
}

func TestUploadRejects(t *testing.T) {
	s := &UploadService{
		svc: &Service{},
		transcode: func(_ context.Context, _ []byte) ([]byte, error) {
			t.Fatal("未知内容不应触发转码")
			return nil, nil
		},
		put: func(_ context.Context, _, _ string, _ []byte) error { return nil },
	}

	// 非图片内容
	_, err := s.Upload(context.Background(), strings.NewReader("not an image at all"))
	if se := asServiceErr(t, err); se.HTTPStatus != 400 || se.Code != 40000 || se.Message != "不支持的图片内容" {
		t.Fatalf("非图片应 400 不支持的图片内容: %v", err)
	}

	// 超 5MiB（魔数合法 + 超限填充）
	oversize := append(pngRaw, bytes.Repeat([]byte{0}, _maxImageSize)...)
	_, err = s.Upload(context.Background(), bytes.NewReader(oversize))
	if se := asServiceErr(t, err); se.HTTPStatus != 400 || se.Code != 40000 || se.Message != "图片大小不能超过 5MiB" {
		t.Fatalf("超限应 400: %v", err)
	}
}

func TestUploadTranscodeAndPutFailures(t *testing.T) {
	// transcode 返回 errInvalidImage（损坏/截断）→ 收敛为 400
	broken := &UploadService{
		svc: &Service{},
		transcode: func(_ context.Context, _ []byte) ([]byte, error) {
			return nil, errInvalidImage
		},
		put: func(_ context.Context, _, _ string, _ []byte) error { return nil },
	}
	_, err := broken.Upload(context.Background(), bytes.NewReader(jpegRaw))
	if se := asServiceErr(t, err); se.Code != 40000 || se.Message != "不支持的图片内容" {
		t.Fatalf("损坏图应 400 不支持的图片内容: %v", err)
	}

	// transcode 其他错误 → 500
	boom := &UploadService{
		svc: &Service{},
		transcode: func(_ context.Context, _ []byte) ([]byte, error) {
			return nil, errors.New("boom")
		},
		put: func(_ context.Context, _, _ string, _ []byte) error { return nil },
	}
	_, err = boom.Upload(context.Background(), bytes.NewReader(jpegRaw))
	if se := asServiceErr(t, err); se.Code != 50000 {
		t.Fatalf("transcode 内部异常应 500: %v", err)
	}

	// put 失败 → 500
	putFail := &UploadService{
		svc: &Service{},
		transcode: func(_ context.Context, _ []byte) ([]byte, error) {
			return []byte("webp"), nil
		},
		put: func(_ context.Context, _, _ string, _ []byte) error { return errors.New("put boom") },
	}
	_, err = putFail.Upload(context.Background(), bytes.NewReader(jpegRaw))
	if se := asServiceErr(t, err); se.Code != 50000 {
		t.Fatalf("put 失败应 500: %v", err)
	}
}

func TestSniffImageType(t *testing.T) {
	tests := []struct {
		give []byte
		want string
	}{
		{give: jpegRaw, want: "image/jpeg"},
		{give: pngRaw, want: "image/png"},
		{give: bmpRaw, want: "image/bmp"},
		{give: tiffRaw, want: "image/tiff"},
		{give: tiffBERaw, want: "image/tiff"},
		{give: webpRaw, want: "image/webp"},
		{give: gifRaw, want: "image/gif"},
		{give: []byte("plain text"), want: "text/plain; charset=utf-8"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if got := sniffImageType(tt.give); got != tt.want {
				t.Fatalf("sniffImageType(% x) = %q, want %q", tt.give[:8], got, tt.want)
			}
		})
	}
}

func TestTranscodeFFmpegIntegration(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg 不可用，跳过集成测试（生产/CI 镜像内置 ffmpeg 包）")
	}
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for i := range img.Pix {
		img.Pix[i] = uint8(i % 251) // 非平坦像素，确保有压缩内容
	}
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("构造 PNG 失败: %v", err)
	}
	out, err := transcodeFFmpeg(context.Background(), buf.Bytes())
	if err != nil {
		t.Fatalf("ffmpeg 转码失败: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("RIFF")) || !bytes.Contains(out[:min(16, len(out))], []byte("WEBP")) {
		t.Fatalf("输出应为 WebP(RIFF...WEBP): 头 %q", out[:min(16, len(out))])
	}

	if _, err := transcodeFFmpeg(context.Background(), append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...)); !errors.Is(err, errInvalidImage) {
		t.Fatalf("损坏输入应 errInvalidImage: %v", err)
	}
}
