package oauth

// Registry 第三方登录提供方注册表（按名称查找）
type Registry struct {
	providers map[string]Provider
}

// NewRegistry 构造注册表；providers 为 nil 时注册表为空（所有平台不可用）
func NewRegistry(providers ...Provider) *Registry {
	m := make(map[string]Provider, len(providers))
	for _, p := range providers {
		m[p.Name()] = p
	}
	return &Registry{providers: m}
}

// Get 按平台名取提供方；未注册返回 ok=false
func (r *Registry) Get(name string) (Provider, bool) {
	p, ok := r.providers[name]
	return p, ok
}

// Names 已注册提供方名称（map 遍历序，调用方需自行排序）
func (r *Registry) Names() []string {
	names := make([]string, 0, len(r.providers))
	for n := range r.providers {
		names = append(names, n)
	}
	return names
}
