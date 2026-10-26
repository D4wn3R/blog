// Package randx crypto/rand 随机短串：随机后缀生成专用（用户名兜底/重试后缀）
package randx

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"
)

// Hex n 位随机 hex 字符串（crypto/rand）
func Hex(n int) string {
	b := make([]byte, (n+1)/2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:n]
}

// Digits4 4 位随机数字串（"user_" 兜底用户名用）
func Digits4() string {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%04d", binary.BigEndian.Uint16(b)%10000)
}
