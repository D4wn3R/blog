package service

import (
	"cmp"
	"context"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/man-mu/blog/backend/internal/model"
	"github.com/man-mu/blog/backend/internal/repository"
)

// CommentService 评论子服务：楼中楼评论树 / 发表 / 软删墓碑（#C1~#C3）
type CommentService struct {
	svc *Service
}

// CommentUserDTO 评论作者白名单（实时 JOIN users，D-comment-user-join，无冗余快照列）
type CommentUserDTO struct {
	ID       uint64 `json:"id"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
}

// ReplyToDTO 被 @ 的被回复人（仅 id + username 定位）
type ReplyToDTO struct {
	ID       uint64 `json:"id"`
	Username string `json:"username"`
}

// CommentDTO 评论白名单（#C1/#C2 响应，schema §7.5 禁序列化 GORM 模型）：
// replies 仅顶级携带（omitempty：子级 nil 不出字段，顶级恒空数组出 []）；
// deleted 仅"已软删且仍有可见后代"的节点为 true（指南 json_omitzero，全模块钉死一种）
type CommentDTO struct {
	ID        uint64         `json:"id"`
	ParentID  uint64         `json:"parent_id"`
	RootID    uint64         `json:"root_id"`
	User      CommentUserDTO `json:"user"`
	ReplyTo   *ReplyToDTO    `json:"reply_to,omitempty"`
	Content   string         `json:"content"`
	CreatedAt time.Time      `json:"created_at"`
	Deleted   bool           `json:"deleted,omitzero"`
	Replies   []CommentDTO   `json:"replies,omitempty"`
}

// List 某文章全量评论树（#C1，D-comment-page）：首步按 slug 防探测查文章，
// 单条 SQL 取全部评论（不滤 status），内存组树 + 墓碑剪枝
func (s *CommentService) List(ctx context.Context, slug string) ([]CommentDTO, error) {
	articleID, err := s.svc.Repo.GetVisibleArticleIDBySlug(ctx, slug)
	if err != nil {
		return nil, errServer(err)
	}
	if articleID == 0 {
		return nil, errNotFound("文章不存在")
	}
	rows, err := s.svc.Repo.ListCommentsByArticle(ctx, articleID)
	if err != nil {
		return nil, errServer(err)
	}
	return buildCommentTree(rows), nil
}

// Create 发表评论/回复（#C2）：发帖人取自 access token；root_id 服务端推导，客户端不传——
// parent.parent_id == 0 ? parent.id : parent.root_id（消灭"回复层级不正确"错误类）
func (s *CommentService) Create(ctx context.Context, slug string, userID uint64, content string, parentID uint64) (*CommentDTO, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errBadRequest("评论内容不能为空")
	}
	if utf8.RuneCountInString(content) > 1000 {
		return nil, errBadRequest("评论内容最多 1000 字")
	}

	// 服务端冗余校验文章可见（防探测口径与 #A2 逐字一致）
	articleID, err := s.svc.Repo.GetVisibleArticleIDBySlug(ctx, slug)
	if err != nil {
		return nil, errServer(err)
	}
	if articleID == 0 {
		return nil, errNotFound("文章不存在")
	}

	var replyToUserID uint64
	var rootID uint64 // 顶级先落 0，CreateComment INSERT 后回填 root_id = 自身 id
	if parentID != 0 {
		parent, err := s.svc.Repo.GetCommentByID(ctx, parentID)
		if err != nil {
			return nil, errServer(err)
		}
		// 目标不存在 / 非本文章 / 已软删 → 40400 评论不存在或已删除
		if parent == nil || parent.ArticleID != articleID || parent.Status != model.CommentStatusNormal {
			return nil, errNotFound("评论不存在或已删除")
		}
		replyToUserID = parent.UserID
		rootID = parent.RootID
		if parent.ParentID == 0 {
			rootID = parent.ID
		}
	}

	comment := &model.Comment{
		ArticleID:     articleID,
		UserID:        userID,
		ParentID:      parentID,
		RootID:        rootID,
		ReplyToUserID: replyToUserID,
		Content:       content,
	}
	if err := s.svc.Repo.CreateComment(ctx, comment); err != nil {
		return nil, errServer(err)
	}

	// 响应 DTO：作者信息实时取 users，与 #C1 口径一致
	user, err := s.svc.Repo.GetUserByID(ctx, userID)
	if err != nil || user == nil {
		return nil, errServer(err)
	}
	dto := &CommentDTO{
		ID:        comment.ID,
		ParentID:  comment.ParentID,
		RootID:    comment.RootID,
		User:      CommentUserDTO{ID: user.ID, Username: user.Username, Avatar: user.Avatar},
		Content:   comment.Content,
		CreatedAt: comment.CreatedAt,
	}
	if parentID == 0 {
		dto.Replies = make([]CommentDTO, 0) // 顶级携带空 replies；楼中楼回复不带该字段
	}
	return dto, nil
}

// Delete 删除评论（#C3，D-comment-tombstone）：整棵子树（自身 + 全部回复）一并软删转墓碑，
// 全树无可见后代后由 #C1 剪枝整体移出评论列表；不存在/已软删 → 幂等成功；
// 本人（uid）或 admin（role 取自 token claims）可删
func (s *CommentService) Delete(ctx context.Context, id uint64, userID uint64, role string) error {
	comment, err := s.svc.Repo.GetCommentByID(ctx, id)
	if err != nil {
		return errServer(err)
	}
	if comment == nil || comment.Status == model.CommentStatusDeleted {
		return nil
	}
	if comment.UserID != userID && role != model.RoleAdmin {
		return errForbidden("只能删除自己的评论")
	}
	if err := s.svc.Repo.SoftDeleteCommentSubtree(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// buildCommentTree 内存组树 + 墓碑剪枝（#C1）：楼中楼两级渲染，顶级 created_at DESC
// （同秒按 id DESC），子树展平挂到顶级 replies 按 created_at ASC（同秒按 id ASC）；
// 无任何 status=0 后代的墓碑剪掉不返回，仍有可见后代的墓碑输出 content:"" + deleted:true
func buildCommentTree(rows []repository.CommentRow) []CommentDTO {
	rowByID := make(map[uint64]*repository.CommentRow, len(rows))
	children := make(map[uint64][]uint64, len(rows))
	for i := range rows {
		row := &rows[i]
		rowByID[row.ID] = row
		if row.ParentID != 0 {
			children[row.ParentID] = append(children[row.ParentID], row.ID)
		}
	}

	// 墓碑可见性（记忆化）：节点是否存在 status=0 的后代；parent 先于子插入，链上无环
	hasNormal := make(map[uint64]bool, len(rows))
	var hasNormalDesc func(uint64) bool
	hasNormalDesc = func(id uint64) bool {
		if v, ok := hasNormal[id]; ok {
			return v
		}
		found := false
		for _, cid := range children[id] {
			if rowByID[cid].Status == model.CommentStatusNormal || hasNormalDesc(cid) {
				found = true
				break
			}
		}
		hasNormal[id] = found
		return found
	}

	// 顶级与子树分桶：子树成员按 root_id 展平（reply_to 定位被 @ 的人，不再嵌套）
	tops := make([]*repository.CommentRow, 0, 16)
	subtrees := make(map[uint64][]*repository.CommentRow, len(rows))
	for i := range rows {
		row := &rows[i]
		if row.ParentID == 0 {
			tops = append(tops, row)
		} else {
			subtrees[row.RootID] = append(subtrees[row.RootID], row)
		}
	}
	slices.SortFunc(tops, func(a, b *repository.CommentRow) int {
		if !a.CreatedAt.Equal(b.CreatedAt) {
			if a.CreatedAt.After(b.CreatedAt) {
				return -1
			}
			return 1
		}
		return cmp.Compare(b.ID, a.ID)
	})

	list := make([]CommentDTO, 0, len(tops))
	for _, top := range tops {
		if top.Status == model.CommentStatusDeleted && !hasNormalDesc(top.ID) {
			continue // 墓碑无可见后代：剪掉（子树内可见成员此时必为空，见剪枝一致性）
		}
		dto := toCommentDTO(top)
		dto.Replies = make([]CommentDTO, 0, len(subtrees[top.ID]))
		for _, row := range subtrees[top.ID] {
			if row.Status == model.CommentStatusDeleted && !hasNormalDesc(row.ID) {
				continue
			}
			dto.Replies = append(dto.Replies, *toCommentDTO(row))
		}
		slices.SortFunc(dto.Replies, func(a, b CommentDTO) int {
			if !a.CreatedAt.Equal(b.CreatedAt) {
				if a.CreatedAt.Before(b.CreatedAt) {
					return -1
				}
				return 1
			}
			return cmp.Compare(a.ID, b.ID)
		})
		list = append(list, *dto)
	}
	return list
}

// toCommentDTO 行转 DTO；墓碑输出 content:"" + deleted:true（可见性由调用方剪枝判定）
func toCommentDTO(row *repository.CommentRow) *CommentDTO {
	dto := &CommentDTO{
		ID:       row.ID,
		ParentID: row.ParentID,
		RootID:   row.RootID,
		User: CommentUserDTO{
			ID:       row.UserID,
			Username: row.Username,
			Avatar:   row.Avatar,
		},
		Content:   row.Content,
		CreatedAt: row.CreatedAt,
	}
	if row.ReplyToUserID != 0 {
		dto.ReplyTo = &ReplyToDTO{ID: row.ReplyToUserID, Username: row.ReplyToUsername}
	}
	if row.Status == model.CommentStatusDeleted {
		dto.Content = ""
		dto.Deleted = true
	}
	return dto
}
