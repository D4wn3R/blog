package service

import "fmt"

// Error 业务错误：携带 HTTP 状态码与业务码，handler 统一映射为响应体。
// 业务码约定：40000 参数无效、40100 未登录/凭证失效、40300 禁用/无权限、40400 不存在、
// 40900 冲突、50000 服务端
type Error struct {
	HTTPStatus int
	Code       int
	Message    string
	// cause 根因错误（errServer 包装的基础设施错误），仅供日志与 errors.Is/As 追溯，不对外输出
	cause error
}

// Error 对外文案；有根因时附带，日志直接打 err 即可定位
func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.cause)
	}
	return e.Message
}

// Unwrap 暴露根因，支持调用方沿包装链 errors.Is / errors.As
func (e *Error) Unwrap() error { return e.cause }

// errBadRequest 参数无效/校验失败（schema §7.8：与现有 helper 对称）
func errBadRequest(msg string) *Error {
	return &Error{HTTPStatus: 400, Code: 40000, Message: msg}
}

func errUnauthorized(msg string) *Error {
	return &Error{HTTPStatus: 401, Code: 40100, Message: msg}
}

func errForbidden(msg string) *Error {
	return &Error{HTTPStatus: 403, Code: 40300, Message: msg}
}

func errNotFound(msg string) *Error {
	return &Error{HTTPStatus: 404, Code: 40400, Message: msg}
}

func errConflict(msg string) *Error {
	return &Error{HTTPStatus: 409, Code: 40900, Message: msg}
}

// errServer 基础设施异常（DB/Redis/对象存储等）：对外统一文案与 50000，
// 根因 err 保留在 cause 里由 handler 记日志，杜绝"响应 50000 但服务端无迹可查"
func errServer(err error) *Error {
	return &Error{HTTPStatus: 500, Code: 50000, Message: "服务异常，请稍后重试", cause: err}
}
