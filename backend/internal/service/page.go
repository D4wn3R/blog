package service

// PageDTO 分页列表统一响应形态（docs/API/README：全站仅两种列表形态，此为分页形态；
// 非分页形态由 handler 层以 gin.H{"list": ...} 包裹）
type PageDTO struct {
	List     any   `json:"list"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

// NormalizePage 分页参数钳制（README 全局约定）：
// page 缺省/0/<1 → 1；page_size 缺省/<1 → 10，>50 → 50。
// 非数字/溢出由 handler 绑定阶段判 400 后调用，本函数只做合法值钳制。
func NormalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 50 {
		pageSize = 50
	}
	return page, pageSize
}
