package service

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// 凭证 Redis 键（spec §3）；state / auth_code TTL 硬编码（spec §9.8 无调参需求），
// refresh TTL 从 cfg.JWT.RefreshExpire 读取
const (
	_stateKeyPrefix    = "oauth:state:"
	_authCodeKeyPrefix = "authcode:"
	_refreshKeyPrefix  = "refresh:"

	_stateTTL    = 5 * time.Minute
	_authCodeTTL = 60 * time.Second
)

// stateValue oauth:state:{state} 的存储结构，state 双语义：uid=0 登录流程 / uid>0 绑定流程
type stateValue struct {
	Provider string `json:"provider"`
	UID      uint64 `json:"uid"`
}

// randomToken 32 字节 crypto/rand 随机数的 hex 编码（64 字符），state / auth_code / refresh 共用
func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
