package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// _maxUploadBody multipart 请求体上限：5MiB 原图 + multipart 边界字段余量；
// 在解析 multipart 前生效，防止超大 body 先撑爆解析内存
const _maxUploadBody = 5<<20 + 1<<20

// Upload 图片上传（#U1，admin 组路由 POST /api/uploads 由主线程注册）：
// multipart 中转，校验/转码/写桶全在服务端，响应 {public_url, object_key}。
// 文件字段固定 "file"；客户端 MIME/文件名一律不信任（服务端魔数嗅探）
func (h *Handler) Upload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, _maxUploadBody)
	fh, err := c.FormFile("file")
	if err != nil {
		var mbErr *http.MaxBytesError
		if errors.As(err, &mbErr) {
			response.BadRequest(c, "图片大小不能超过 5MiB")
			return
		}
		response.BadRequest(c, "参数错误")
		return
	}
	f, err := fh.Open()
	if err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	defer func() { _ = f.Close() }() // 清理路径，关闭失败无需处理

	res, err := h.svc.Upload.Upload(c.Request.Context(), f)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, res)
}
