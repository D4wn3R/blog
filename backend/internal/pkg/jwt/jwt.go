// Package jwt 凭证签发与解析：HS256 固定算法，Claims 承载登录态与加密文章解锁态
package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims 自定义 JWT 载荷
// 登录态：UserID + Role
// 加密文章解锁态：ArticleID（此时 UserID/Role 为空）
type Claims struct {
	UserID    uint64 `json:"uid,omitempty"`
	Role      string `json:"role,omitempty"`
	ArticleID uint64 `json:"aid,omitempty"`
	jwt.RegisteredClaims
}

// Sign 签发 token：由本函数设置 Issuer/IssuedAt/ExpiresAt，
// 调用方预设的其余 RegisteredClaims 字段（如 ID/Subject）原样保留
func Sign(secret string, ttl time.Duration, claims *Claims) (string, error) {
	now := time.Now()
	claims.Issuer = "blog-backend"
	claims.IssuedAt = jwt.NewNumericDate(now)
	claims.ExpiresAt = jwt.NewNumericDate(now.Add(ttl))
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// Parse 校验并解析 token：固定 HS256 算法校验，返回自定义 Claims；
// 签名无效/过期/算法不符均返回错误
func Parse(secret, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		// 固定 HS256，杜绝算法混淆类攻击
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
