// Package rustfs 对象存储客户端封装：建桶与公开读策略、服务端对象写入。
// RustFS 为 S3 兼容存储，协议层沿用 minio-go 客户端
package rustfs

import (
	"bytes"
	"context"
	"fmt"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client RustFS 对象存储客户端（minio-go 封装，持有目标桶）
type Client struct {
	cli    *minio.Client
	bucket string
}

// readPublicPolicy 桶级匿名只读策略（/files/{object} 静态资源对外可 GET）
func readPublicPolicy(bucket string) string {
	return fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}`, bucket)
}

// New 连接 RustFS，bucket 不存在则创建；并幂等设置匿名只读策略
func New(endpoint, accessKey, secretKey string, useSSL bool, bucket string) (*Client, error) {
	opts := &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	}
	cli, err := minio.New(endpoint, opts)
	if err != nil {
		return nil, err
	}

	ctx := context.Background()
	if err := cli.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
		exists, errExists := cli.BucketExists(ctx, bucket)
		if errExists != nil || !exists {
			return nil, err
		}
	}
	if err := cli.SetBucketPolicy(ctx, bucket, readPublicPolicy(bucket)); err != nil {
		return nil, fmt.Errorf("设置桶公开读策略失败: %w", err)
	}

	return &Client{cli: cli, bucket: bucket}, nil
}

// PutObject 服务端对象写入（#U1 转码上传链路）：字节与 MIME 均由服务端决定，
// 杜绝任意 MIME 落公开桶并按该 MIME 回源，构成存储型 XSS 面（upload.md #U1 硬约束）
func (c *Client) PutObject(ctx context.Context, objectKey, contentType string, data []byte) error {
	_, err := c.cli.PutObject(ctx, c.bucket, objectKey, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	return err
}

// Bucket 目标桶名（调用方拼公开 URL 用）
func (c *Client) Bucket() string { return c.bucket }
