// Package password 密码哈希：bcrypt 统一封装，禁止 md5/sha1 直存
package password

import "golang.org/x/crypto/bcrypt"

// Hash 明文密码 bcrypt 哈希（DefaultCost）
func Hash(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(b), err
}

// Verify 校验明文与哈希是否匹配
func Verify(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
